#![no_std]

pub mod errors;
pub mod storage;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractevent, contractimpl, Address, Env, Vec};

use crate::errors::YieldGuardError;
use crate::storage::{
    has_policy, read_policy, validate_policy_params, write_policy, YieldGuardPolicy,
    WINDOW_DURATION_SECONDS,
};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuardInitialized {
    #[topic]
    pub owner: Address,
    pub agent_signer: Address,
    pub max_single_tx_amount: i128,
    pub daily_spend_limit: i128,
    pub min_health_factor_bps: u32,
    pub window_start: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RulesUpdated {
    #[topic]
    pub owner: Address,
    pub agent_signer: Address,
    pub max_single_tx_amount: i128,
    pub daily_spend_limit: i128,
    pub min_health_factor_bps: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuardPaused {
    #[topic]
    pub owner: Address,
    pub timestamp: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct GuardUnpaused {
    #[topic]
    pub owner: Address,
    pub timestamp: u64,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExecutionValidated {
    #[topic]
    pub owner: Address,
    #[topic]
    pub target_protocol: Address,
    pub executor: Address,
    pub amount: i128,
    pub spent_in_window: i128,
    pub window_start: u64,
    pub projected_health_factor_bps: u32,
}

#[contract]
pub struct YieldGuardContract;

#[contractimpl]
impl YieldGuardContract {
    /// Initializes a per-owner `YieldGuardPolicy` in Persistent Storage.
    /// Only callable once per owner; subsequent changes must go through `update_rules`.
    pub fn initialize_guard(
        env: Env,
        owner: Address,
        agent_signer: Address,
        max_single_tx_amount: i128,
        daily_spend_limit: i128,
        min_health_factor_bps: u32,
        allowed_protocols: Vec<Address>,
    ) -> Result<YieldGuardPolicy, YieldGuardError> {
        owner.require_auth();

        if has_policy(&env, &owner) {
            return Err(YieldGuardError::AlreadyInitialized);
        }

        validate_policy_params(
            max_single_tx_amount,
            daily_spend_limit,
            min_health_factor_bps,
            &allowed_protocols,
        )?;

        let window_start = env.ledger().timestamp();
        let policy = YieldGuardPolicy {
            agent_signer: agent_signer.clone(),
            max_single_tx_amount,
            daily_spend_limit,
            spent_in_window: 0,
            window_start,
            min_health_factor_bps,
            allowed_protocols,
            is_paused: false,
        };

        write_policy(&env, &owner, &policy);

        GuardInitialized {
            owner,
            agent_signer,
            max_single_tx_amount,
            daily_spend_limit,
            min_health_factor_bps,
            window_start,
        }
        .publish(&env);

        Ok(policy)
    }

    /// Updates owner guardrail parameters without resetting rolling window spend or pause state.
    pub fn update_rules(
        env: Env,
        owner: Address,
        agent_signer: Address,
        max_single_tx_amount: i128,
        daily_spend_limit: i128,
        min_health_factor_bps: u32,
        allowed_protocols: Vec<Address>,
    ) -> Result<YieldGuardPolicy, YieldGuardError> {
        owner.require_auth();

        let mut policy = read_policy(&env, &owner)?;

        validate_policy_params(
            max_single_tx_amount,
            daily_spend_limit,
            min_health_factor_bps,
            &allowed_protocols,
        )?;

        policy.agent_signer = agent_signer.clone();
        policy.max_single_tx_amount = max_single_tx_amount;
        policy.daily_spend_limit = daily_spend_limit;
        policy.min_health_factor_bps = min_health_factor_bps;
        policy.allowed_protocols = allowed_protocols;

        write_policy(&env, &owner, &policy);

        RulesUpdated {
            owner,
            agent_signer,
            max_single_tx_amount,
            daily_spend_limit,
            min_health_factor_bps,
        }
        .publish(&env);

        Ok(policy)
    }

    /// Emergency kill-switch: immediately freezes all agent executions for `owner`.
    pub fn pause_guard(env: Env, owner: Address) -> Result<(), YieldGuardError> {
        owner.require_auth();

        let mut policy = read_policy(&env, &owner)?;
        policy.is_paused = true;
        write_policy(&env, &owner, &policy);

        GuardPaused {
            owner,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);

        Ok(())
    }

    /// Lifts the emergency freeze for `owner`.
    pub fn unpause_guard(env: Env, owner: Address) -> Result<(), YieldGuardError> {
        owner.require_auth();

        let mut policy = read_policy(&env, &owner)?;
        policy.is_paused = false;
        write_policy(&env, &owner, &policy);

        GuardUnpaused {
            owner,
            timestamp: env.ledger().timestamp(),
        }
        .publish(&env);

        Ok(())
    }

    /// Enforces all on-chain guardrails and records spend into the 24-hour rolling window.
    ///
    /// Authorization: `executor` must be either `owner` (user-signed non-custodial flow)
    /// or the policy's designated `agent_signer`, and must satisfy `executor.require_auth()`.
    pub fn validate_and_record_execution(
        env: Env,
        owner: Address,
        executor: Address,
        target_protocol: Address,
        amount: i128,
        projected_health_factor_bps: u32,
    ) -> Result<YieldGuardPolicy, YieldGuardError> {
        let mut policy = read_policy(&env, &owner)?;

        if executor != owner && executor != policy.agent_signer {
            return Err(YieldGuardError::Unauthorized);
        }
        executor.require_auth();

        if policy.is_paused {
            return Err(YieldGuardError::GuardPaused);
        }

        if amount <= 0 {
            return Err(YieldGuardError::InvalidAmount);
        }

        if !policy.allowed_protocols.contains(&target_protocol) {
            return Err(YieldGuardError::UnauthorizedProtocol);
        }

        if amount > policy.max_single_tx_amount {
            return Err(YieldGuardError::SingleTxLimitExceeded);
        }

        if projected_health_factor_bps < policy.min_health_factor_bps {
            return Err(YieldGuardError::HealthFactorBelowMinimum);
        }

        let now = env.ledger().timestamp();
        let elapsed = now
            .checked_sub(policy.window_start)
            .ok_or(YieldGuardError::ArithmeticOverflow)?;

        if elapsed >= WINDOW_DURATION_SECONDS {
            policy.spent_in_window = 0;
            policy.window_start = now;
        }

        let next_spent = policy
            .spent_in_window
            .checked_add(amount)
            .ok_or(YieldGuardError::ArithmeticOverflow)?;

        if next_spent > policy.daily_spend_limit {
            return Err(YieldGuardError::DailyLimitExceeded);
        }

        policy.spent_in_window = next_spent;
        write_policy(&env, &owner, &policy);

        ExecutionValidated {
            owner,
            target_protocol,
            executor,
            amount,
            spent_in_window: policy.spent_in_window,
            window_start: policy.window_start,
            projected_health_factor_bps,
        }
        .publish(&env);

        Ok(policy)
    }

    /// Read-only accessor returning the owner's active `YieldGuardPolicy`.
    pub fn get_policy(env: Env, owner: Address) -> Result<YieldGuardPolicy, YieldGuardError> {
        read_policy(&env, &owner)
    }
}
