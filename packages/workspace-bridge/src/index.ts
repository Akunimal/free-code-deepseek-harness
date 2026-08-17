import { InterchangeChat, ImportableChat } from '@freecode/shared-types';
import { ChatImporter } from '@freecode/chat-importer';
import { HarnessRpcClient, buildContinueSystemMessage } from './rpc-client.js';

export { HarnessRpcClient, buildContinueSystemMessage } from './rpc-client.js';
export { findChatsForFolder, continueChat } from './bridge.js';
export type { ContinueOptions, CandidateChat } from './bridge.js';

/** Re-export of the common types for convenience. */
export type { InterchangeChat, ImportableChat, ChatImporter };