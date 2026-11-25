use soroban_sdk::testutils::{Address as _, Ledger};
use soroban_sdk::{vec, Address, Env};

use crate::errors::YieldGuardError;
use crate::storage::WINDOW_DURATION_SECONDS;
use crate::{YieldGuardContract, YieldGuardContractClient};

const STROOPS: i128 = 10_000_000;
const INITIAL_TIMESTAMP: u64 = 1_764_000_000;

fn setup_fixture() -> (
    Env,
    Address,
    Address,
    Address,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = INITIAL_TIMESTAMP;
    });

    let contract_id = env.register(YieldGuardContract, ());
    let owner = Address::generate(&env);
    let agent_signer = Address::generate(&env);
    let blend_pool = Address::generate(&env);
    let defindex_vault = Address::generate(&env);
    let unknown_protocol = Address::generate(&env);

    (
        env,
        contract_id,
        owner,
        agent_signer,
        blend_pool,
        defindex_vault,
        unknown_protocol,
    )
}

fn init_default_policy(
    env: &Env,
    client: &YieldGuardContractClient<'_>,
    owner: &Address,
    agent_signer: &Address,
    blend_pool: &Address,
    defindex_vault: &Address,
) {
    let allowed = vec![env, blend_pool.clone(), defindex_vault.clone()];
    client.initialize_guard(
        owner,
        agent_signer,
        &(1_000 * STROOPS), // max_single_tx_amount = 1,000 USDC
        &(2_500 * STROOPS), // daily_spend_limit = 2,500 USDC
        &15_000u32,         // min_health_factor_bps = 1.50x
        &allowed,
    );
}

#[test]
fn test_valid_execution_and_cumulative_tracking() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    // 1. Agent executes 600 USDC repay against Blend pool (HF 1.65x)
    let after_first = client.validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(600 * STROOPS),
        &16_500u32,
    );
    assert_eq!(after_first.spent_in_window, 600 * STROOPS);
    assert_eq!(after_first.window_start, INITIAL_TIMESTAMP);
    assert!(!after_first.is_paused);

    // 2. Owner executes 900 USDC rebalance into DeFindex vault (HF 1.50x boundary)
    let after_second = client.validate_and_record_execution(
        &owner,
        &owner,
        &defindex_vault,
        &(900 * STROOPS),
        &15_000u32,
    );
    assert_eq!(after_second.spent_in_window, 1_500 * STROOPS);

    let stored = client.get_policy(&owner);
    assert_eq!(stored.spent_in_window, 1_500 * STROOPS);
}

#[test]
fn test_24h_window_reset() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    // Exhaust the full 2,500 USDC daily limit across 3 transactions
    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(1_000 * STROOPS), &16_000u32);
    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(1_000 * STROOPS), &16_000u32);
    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(500 * STROOPS), &16_000u32);

    // 1 second before window expiry, any additional spend must fail
    env.ledger().with_mut(|li| {
        li.timestamp = INITIAL_TIMESTAMP + WINDOW_DURATION_SECONDS - 1;
    });
    let before_reset = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(1 * STROOPS),
        &16_000u32,
    );
    assert_eq!(before_reset, Err(Ok(YieldGuardError::DailyLimitExceeded)));

    // Advance to exact 24h boundary -> window resets and new execution succeeds
    let next_window_ts = INITIAL_TIMESTAMP + WINDOW_DURATION_SECONDS;
    env.ledger().with_mut(|li| {
        li.timestamp = next_window_ts;
    });

    let after_reset = client.validate_and_record_execution(
        &owner,
        &agent_signer,
        &defindex_vault,
        &(800 * STROOPS),
        &17_200u32,
    );
    assert_eq!(after_reset.spent_in_window, 800 * STROOPS);
    assert_eq!(after_reset.window_start, next_window_ts);
}

#[test]
fn test_exceeded_single_tx_limit() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    let res = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(1_001 * STROOPS), // > 1,000 USDC single-tx cap
        &17_000u32,
    );
    assert_eq!(res, Err(Ok(YieldGuardError::SingleTxLimitExceeded)));
    assert_eq!(client.get_policy(&owner).spent_in_window, 0);
}

#[test]
fn test_exceeded_daily_limit() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(1_000 * STROOPS), &16_500u32);
    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(1_000 * STROOPS), &16_500u32);

    // 600 USDC is within single-tx cap (1,000) but pushes 24h total to 2,600 > 2,500
    let res = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(600 * STROOPS),
        &16_500u32,
    );
    assert_eq!(res, Err(Ok(YieldGuardError::DailyLimitExceeded)));
    assert_eq!(client.get_policy(&owner).spent_in_window, 2_000 * STROOPS);
}

#[test]
fn test_unauthorized_target_protocol() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, unknown_protocol) =
        setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    let res = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &unknown_protocol,
        &(250 * STROOPS),
        &18_000u32,
    );
    assert_eq!(res, Err(Ok(YieldGuardError::UnauthorizedProtocol)));
    assert_eq!(client.get_policy(&owner).spent_in_window, 0);
}

#[test]
fn test_emergency_pause_and_unpause() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    client.pause_guard(&owner);
    assert!(client.get_policy(&owner).is_paused);

    let blocked = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(100 * STROOPS),
        &19_000u32,
    );
    assert_eq!(blocked, Err(Ok(YieldGuardError::GuardPaused)));

    client.unpause_guard(&owner);
    assert!(!client.get_policy(&owner).is_paused);

    let resumed = client.validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(100 * STROOPS),
        &19_000u32,
    );
    assert_eq!(resumed.spent_in_window, 100 * STROOPS);
}

#[test]
fn test_health_factor_floor_and_unauthorized_executor() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    // Projected HF 1.49x < min_health_factor_bps 1.50x
    let low_hf = client.try_validate_and_record_execution(
        &owner,
        &agent_signer,
        &blend_pool,
        &(200 * STROOPS),
        &14_900u32,
    );
    assert_eq!(low_hf, Err(Ok(YieldGuardError::HealthFactorBelowMinimum)));

    // Random third-party executor rejected
    let attacker = Address::generate(&env);
    let unauth = client.try_validate_and_record_execution(
        &owner,
        &attacker,
        &blend_pool,
        &(200 * STROOPS),
        &17_000u32,
    );
    assert_eq!(unauth, Err(Ok(YieldGuardError::Unauthorized)));
}

#[test]
fn test_update_rules_preserves_spend_and_pause_state() {
    let (env, contract_id, owner, agent_signer, blend_pool, defindex_vault, _) = setup_fixture();
    let client = YieldGuardContractClient::new(&env, &contract_id);

    init_default_policy(
        &env,
        &client,
        &owner,
        &agent_signer,
        &blend_pool,
        &defindex_vault,
    );

    // Duplicate initialization must fail
    let dup = client.try_initialize_guard(
        &owner,
        &agent_signer,
        &(500 * STROOPS),
        &(1_000 * STROOPS),
        &15_000u32,
        &vec![&env, blend_pool.clone()],
    );
    assert_eq!(dup, Err(Ok(YieldGuardError::AlreadyInitialized)));

    // Record 400 USDC spend and pause guard
    client.validate_and_record_execution(&owner, &agent_signer, &blend_pool, &(400 * STROOPS), &16_000u32);
    client.pause_guard(&owner);

    // Update rules with tighter single-tx cap & higher daily limit
    let new_agent = Address::generate(&env);
    let updated = client.update_rules(
        &owner,
        &new_agent,
        &(500 * STROOPS),
        &(3_000 * STROOPS),
        &16_000u32,
        &vec![&env, blend_pool.clone()],
    );

    assert_eq!(updated.agent_signer, new_agent);
    assert_eq!(updated.max_single_tx_amount, 500 * STROOPS);
    assert_eq!(updated.daily_spend_limit, 3_000 * STROOPS);
    assert_eq!(updated.min_health_factor_bps, 16_000u32);
    assert_eq!(updated.spent_in_window, 400 * STROOPS);
    assert!(updated.is_paused);
}
