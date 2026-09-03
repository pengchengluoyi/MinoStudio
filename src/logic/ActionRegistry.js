/**
 * A centralized registry for all actions in the application.
 * This is used by the Command Palette and can be used by other features like an AI Copilot.
 *
 * Structure:
 * {
 *   id: 'unique.action.id',
 *   title: 'User-facing title of the action',
 *   keywords: ['search', 'terms'],
 *   handler: (router) => { ... } // Function to execute the action
 * }
 */
export const actions = [
  {
    id: 'nav.dialogue',
    title: 'Go to Dialogue / Copilot',
    keywords: ['dialogue', 'copilot', '对话', '助手', 'home'],
    handler: (router) => router.push({ name: 'Dialogue' }),
  },
  {
    id: 'nav.agentHistory',
    title: 'Go to Agent History',
    keywords: ['agent', 'history', 'records', '对话记录'],
    handler: (router) => router.push({ name: 'AgentHistory' }),
  },
  {
    id: 'nav.schedule',
    title: 'Go to Schedule Settings',
    keywords: ['tasks', 'cron', 'jobs', 'schedule', 'timer'],
    handler: (router) => router.push({ name: 'SettingsSchedule' }),
  },
]