// Action, Form, and Change handler constants
// Centralizes UI contracts to avoid magic strings.

export const Actions = {
  OPEN_COMMAND: 'open-command',
  OPEN_FOCUS_PICKER: 'open-focus-picker',
  PORTFOLIO_MODE: 'portfolio-mode',
  FOCUS_PRIMARY_CHANNEL: 'focus-primary-channel',
  FOCUS_CHANNEL: 'focus-channel',
  SET_ACTIVE_PROJECT: 'set-active-project',

  START_FOCUS_MISSION: 'start-focus-mission',
  START_MISSION: 'start-mission',
  COMPLETE_MISSION: 'complete-mission',
  COMPLETE_WORKFLOW_TASK: 'complete-workflow-task',
  GENERATE_WORKFLOW_PLAN: 'generate-workflow-plan',
  COMPLETE_ONBOARDING: 'complete-onboarding',
  COMPLETE_DAILY_MISSION: 'complete-daily-mission',

  COPY_PROMPT: 'copy-prompt',
  COPY_CAPCUT_PROMPT: 'copy-capcut-prompt',
  GENERATE_WITH_AI: 'generate-with-ai',
  SAVE_PROMPT: 'save-prompt',
  PARSE_RESPONSE: 'parse-response',

  MOVE_PROJECT_NEXT: 'move-project-next',
  DELETE_PROJECT: 'delete-project',
  TOGGLE_SAVE_IDEA: 'toggle-save-idea',
  RECALCULATE_RISK: 'recalculate-risk',

  TOGGLE_TASK: 'toggle-task',

  RESET_SIMULATOR: 'reset-simulator',

  SAVE_SETTINGS: 'save-settings',
  REFRESH_AI_STATUS: 'refresh-ai-status',
  TEST_AI_PROVIDER: 'test-ai-provider',
  CLEAR_AI_KEY: 'clear-ai-key',

  EXPORT_ICS: 'export-ics',
  EXPORT_WORKSPACE: 'export-workspace',
  EXPORT_PROJECTS_CSV: 'export-projects-csv',
  EXPORT_ANALYTICS_CSV: 'export-analytics-csv',
  REMOVE_DEMO_DATA: 'remove-demo-data',
  RESET_WORKSPACE: 'reset-workspace',

  DISMISS_TOAST: 'dismiss-toast',

  PICKER_PORTFOLIO: 'picker-portfolio',
  PICKER_CHANNEL: 'picker-channel',
  PICKER_PROJECT: 'picker-project',
} as const;

export type ActionType = typeof Actions[keyof typeof Actions];

export const Forms = {
  IDEA_FILTER: 'idea-filter',
  CREATE_CHANNEL: 'create-channel',
  CREATE_PROJECT: 'create-project',
  PROMPT_CONTEXT: 'prompt-context',
  CREDIT_ENTRY: 'credit-entry',
  CALENDAR_TASK: 'calendar-task',
  RESCHEDULE_PROJECT: 'reschedule-project',
  SIMULATION: 'simulation',
  ANALYTICS_ENTRY: 'analytics-entry',
  MONETIZATION_PATH: 'monetization-path',
  SETTINGS: 'settings',
  AI_SECRET: 'ai-secret',
} as const;

export type FormType = typeof Forms[keyof typeof Forms];

export const Changes = {
  ACTIVE_CHANNEL: 'active-channel',
  ACTIVE_PROJECT: 'active-project',
  POLICY_PROJECT: 'policy-project',
  POLICY_CHECK: 'policy-check',
} as const;

export type ChangeType = typeof Changes[keyof typeof Changes];
