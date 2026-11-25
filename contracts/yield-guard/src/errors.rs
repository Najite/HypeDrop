use soroban_sdk::contracterror;

/// Explicit contract error codes aligned 1:1 with `YieldGuardErrorCode`
/// in `packages/agent-core/src/types.ts`.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum YieldGuardError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    GuardPaused = 3,
    UnauthorizedProtocol = 4,
    SingleTxLimitExceeded = 5,
    DailyLimitExceeded = 6,
    HealthFactorBelowMinimum = 7,
    InvalidAmount = 8,
    InvalidConfig = 9,
    ArithmeticOverflow = 10,
    Unauthorized = 11,
}
