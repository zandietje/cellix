export const CHAT_CONFIG = {
  /** Token reserve for system prompt truncation */
  SYSTEM_PROMPT_TRUNCATE_BUFFER: 1500,
  /** Token reserve for user message */
  MESSAGE_TOKEN_RESERVE: 500,
  /** Max planner output tokens */
  PLANNER_MAX_TOKENS: 256,
  /** Temperature for write operations (low = deterministic) */
  TEMPERATURE_ACTION: 0.2,
  /** Temperature for analysis/questions */
  TEMPERATURE_DEFAULT: 0.7,
  /** Planner temperature (always deterministic) */
  TEMPERATURE_PLANNER: 0,
} as const;
