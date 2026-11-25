use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::errors::YieldGuardError;

/// Approximate number of Stellar ledgers in 24 hours (~5 seconds per ledger).
pub const DAY_IN_LEDGERS: u32 = 17_280;

/// Persistent storage TTL threshold (~30 days).
pub const POLICY_TTL_THRESHOLD: u32 = 30 * DAY_IN_LEDGERS;

/// Persistent storage TTL bump target (~180 days).
pub const POLICY_TTL_BUMP: u32 = 180 * DAY_IN_LEDGERS;

/// Rolling spend window duration in seconds (24 hours).
pub const WINDOW_DURATION_SECONDS: u64 = 86_400;

/// Minimum allowed Health Factor floor in basis points (10,000 bps = 1.00x).
pub const MIN_ALLOWED_HEALTH_FACTOR_BPS: u32 = 10_000;

/// Maximum number of allowlisted protocol contracts per owner policy.
pub const MAX_ALLOWED_PROTOCOLS: u32 = 32;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Policy(Address),
}

/// Per-owner non-custodial guardrail policy stored in Soroban Persistent Storage.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct YieldGuardPolicy {
    pub agent_signer: Address,
    pub max_single_tx_amount: i128,
    pub daily_spend_limit: i128,
    pub spent_in_window: i128,
    pub window_start: u64,
    pub min_health_factor_bps: u32,
    pub allowed_protocols: Vec<Address>,
    pub is_paused: bool,
}

pub fn has_policy(env: &Env, owner: &Address) -> bool {
    let key = DataKey::Policy(owner.clone());
    env.storage().persistent().has(&key)
}

/// Pure read of an owner's policy (no write footprint mutation).
pub fn read_policy(env: &Env, owner: &Address) -> Result<YieldGuardPolicy, YieldGuardError> {
    let key = DataKey::Policy(owner.clone());
    env.storage()
        .persistent()
        .get(&key)
        .ok_or(YieldGuardError::NotInitialized)
}

/// Writes an owner's policy to Persistent Storage and extends its TTL.
pub fn write_policy(env: &Env, owner: &Address, policy: &YieldGuardPolicy) {
    let key = DataKey::Policy(owner.clone());
    let storage = env.storage().persistent();
    storage.set(&key, policy);
    storage.extend_ttl(&key, POLICY_TTL_THRESHOLD, POLICY_TTL_BUMP);
}

/// Validates rule invariants before initializing or updating a policy.
pub fn validate_policy_params(
    max_single_tx_amount: i128,
    daily_spend_limit: i128,
    min_health_factor_bps: u32,
    allowed_protocols: &Vec<Address>,
) -> Result<(), YieldGuardError> {
    if max_single_tx_amount <= 0 || daily_spend_limit <= 0 {
        return Err(YieldGuardError::InvalidConfig);
    }
    if max_single_tx_amount > daily_spend_limit {
        return Err(YieldGuardError::InvalidConfig);
    }
    if min_health_factor_bps < MIN_ALLOWED_HEALTH_FACTOR_BPS {
        return Err(YieldGuardError::InvalidConfig);
    }
    if allowed_protocols.is_empty() || allowed_protocols.len() > MAX_ALLOWED_PROTOCOLS {
        return Err(YieldGuardError::InvalidConfig);
    }
    Ok(())
}
