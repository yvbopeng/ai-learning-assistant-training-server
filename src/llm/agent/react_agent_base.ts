import { HumanMessage } from "@langchain/core/messages";
import type { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import type { LanguageModelLike } from "@langchain/core/language_models/base";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent, type CreateReactAgentParams } from "@langchain/langgraph/prebuilt";
import { PostgreSQLPersistentStorage } from "../storage/persistent_storage";

/**
 * Configuration required to instantiate a LangGraph React agent without tools.
 */
export type ReactAgentOptions = {
  /**
   * Chat model instance compatible with OpenAI-style tool calling.
   */
  llm: LanguageModelLike;
  /**
   * Optional system prompt or runnable used to prime the agent before it plans.
   */
  prompt?: CreateReactAgentParams["prompt"];
  /**
   * Optional set of tools to expose. Defaults to none.
   */
  tools?: CreateReactAgentParams["tools"];
  /**
   * Checkpoint saver instance controlling how long-term memory is stored. Defaults to {@link MemorySaver}.
   */
  checkpointSaver?: CreateReactAgentParams["checkpointSaver"];
  /**
   * Optional alias for {@link checkpointSaver}. If omitted, falls back to the resolved checkpoint saver.
   */
  checkpointer?: CreateReactAgentParams["checkpointer"];
  /**
   * Optional shared store used when persisting memory across threads or processes.
   */
  store?: CreateReactAgentParams["store"];
  /**
   * Default thread identifier applied to invocations when one is not provided explicitly.
   */
  defaultThreadId?: string;
  /**
   * Optional PostgreSQL persistent storage instance for advanced features.
   */
  postgresStorage?: PostgreSQLPersistentStorage;
};

type ReactAgentGraph = ReturnType<typeof createReactAgent>;
type InvokeOptions = Parameters<ReactAgentGraph["invoke"]>[1];
type StreamOptions = Parameters<ReactAgentGraph["stream"]>[1];
type InvokeReturn = Awaited<ReturnType<ReactAgentGraph["invoke"]>>;

/**
 * Alias for the state shape produced by LangGraph's prebuilt React agent.
 */
export type ReactAgentState = InvokeReturn;

/**
 * Thin wrapper around LangGraph's prebuilt React agent that disables tool usage.
 */
export class ReactAgent {
  private readonly graph: ReactAgentGraph;
  private readonly defaultThreadId?: string;
  private readonly postgresStorage?: PostgreSQLPersistentStorage;

  constructor(options: ReactAgentOptions) {
    const {
      llm,
      prompt,
      tools,
      checkpointSaver,
      checkpointer,
      store,
      defaultThreadId,
      postgresStorage,
    } = options;

    // 优先使用 checkpointSaver/checkpointer，否则默认 MemorySaver
    let resolvedSaver = checkpointSaver ?? checkpointer;
    if (!resolvedSaver) {
      resolvedSaver = new MemorySaver();
    }

    this.graph = createReactAgent({
      llm,
      tools: tools ?? [],
      prompt,
      checkpointSaver: resolvedSaver,
      store,
    });

    this.defaultThreadId = defaultThreadId;
    this.postgresStorage = postgresStorage;
  }

  /**
   * Executes the agent end-to-end and returns the final LangGraph state.
   */
  async invoke(
    messages: BaseMessageLike[],
    options?: InvokeOptions
  ): Promise<ReactAgentState> {
    return this.graph.invoke(
      { messages },
      this.applyThreadConfig(options) as InvokeOptions
    );
  }

  /**
   * Streams intermediate state updates emitted while the agent reasons.
   */
  stream(messages: BaseMessageLike[], options?: StreamOptions) {
    const mergedOptions = {
      ...(options ?? {}),
      streamMode: options?.streamMode ?? "messages",
    } as StreamOptions | undefined;

    return this.graph.stream(
      { messages },
      this.applyThreadConfig(mergedOptions) as StreamOptions
    );
  }

  /**
   * Helper that runs the agent and extracts the last AI message as plain text.
   */
  async runToText(
    messages: BaseMessageLike[],
    options?: InvokeOptions
  ): Promise<string> {
    const state = await this.invoke(messages, options);
    const last = state.messages[state.messages.length - 1];
    return last ? messageContentToString(last) : "";
  }

  /**
   * Convenience helper that sends a single user input to the agent and
   * returns the model's textual reply. Uses checkpointer to maintain conversation history.
   */
  async chat(userInput: string, options?: InvokeOptions): Promise<string> {
    // Get current conversation state to build upon existing messages
    const threadId = options?.configurable?.thread_id ?? this.defaultThreadId;
    let existingMessages: BaseMessageLike[] = [];
    
    if (threadId) {
      try {
        // Try to get existing state for this thread
        const currentState = await this.graph.getState({
          configurable: { thread_id: threadId }
        });
        existingMessages = currentState?.values?.messages ?? [];
      } catch (error) {
        // If no existing state, start with empty messages
        existingMessages = [];
      }
    }

    // Add the new user message to existing conversation
    const allMessages = [...existingMessages, new HumanMessage(userInput)];
    
    const responseState = await this.invoke(allMessages, options);

    const aiMessage = responseState.messages.at(-1);
    const response = aiMessage ? messageContentToString(aiMessage) : "";

    // Update analytics if PostgreSQL storage is available
    if (this.postgresStorage?.isConnected() && threadId) {
      await this.updateAnalytics(threadId, responseState.messages);
    }

    return response;
  }

  /**
   * Starts a new conversation thread and returns the thread ID.
   * Useful for managing multiple separate conversations.
   */
  createNewThread(): string {
    return `thread_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Gets the conversation history for a specific thread.
   */
  async getConversationHistory(threadId?: string): Promise<BaseMessage[]> {
    const resolvedThreadId = threadId ?? this.defaultThreadId;
    if (!resolvedThreadId) {
      return [];
    }

    try {
      const currentState = await this.graph.getState({
        configurable: { thread_id: resolvedThreadId }
      });
      return currentState?.values?.messages ?? [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Map a user ID to a thread ID for session management
   */
  async mapUserToThread(userId: string, threadId?: string, metadata?: any): Promise<string> {
    const finalThreadId = threadId || this.createNewThread();
    
    if (this.postgresStorage?.isConnected()) {
      await this.postgresStorage.mapUserToThread(userId, finalThreadId, metadata);
    }
    
    return finalThreadId;
  }

  /**
   * Get all thread IDs for a specific user
   */
  async getUserThreads(userId: string): Promise<Array<{ threadId: string; createdAt: Date; updatedAt: Date; metadata?: any }>> {
    if (!this.postgresStorage?.isConnected()) {
      throw new Error("PostgreSQL storage not available");
    }
    
    return this.postgresStorage.getUserThreads(userId);
  }

  /**
   * Get conversation analytics for a thread
   */
  async getThreadAnalytics(threadId: string): Promise<any> {
    if (!this.postgresStorage?.isConnected()) {
      throw new Error("PostgreSQL storage not available");
    }
    // 这里 threadId 既是 sessionId，也是 userId，需根据业务传递正确 userId
    // 这里假设 userId = threadId，实际应传入真实 userId
    return this.postgresStorage.getConversationAnalytics(threadId, threadId);
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(daysOld: number = 30): Promise<number> {
    if (!this.postgresStorage?.isConnected()) {
      throw new Error("PostgreSQL storage not available");
    }
    
    return this.postgresStorage.cleanupExpiredSessions(daysOld);
  }

  /**
   * Get the PostgreSQL storage instance
   */
  getPostgreSQLStorage(): PostgreSQLPersistentStorage | undefined {
    return this.postgresStorage;
  }

  /**
   * Update conversation analytics
   */
  private async updateAnalytics(threadId: string, messages: BaseMessage[]): Promise<void> {
    if (!this.postgresStorage?.isConnected()) {
      return;
    }

    const userMessages = messages.filter(msg => msg._getType() === "human").length;
    const aiMessages = messages.filter(msg => msg._getType() === "ai").length;
    const totalMessages = messages.length;
    // 这里假设 userId = threadId，conversationSummary/analyticsData 可自定义
    try {
      await this.postgresStorage.updateConversationAnalytics(
        threadId, // sessionId
        threadId, // userId（实际应传真实 userId）
        '', // conversationSummary
        { totalMessages, userMessages, aiMessages } // analyticsData
      );
    } catch (error) {
      console.warn("Failed to update conversation analytics:", error);
    }
  }

  private applyThreadConfig(options?: Record<string, any>) {
    if (!this.defaultThreadId) {
      return options;
    }

    const baseOptions = options ?? {};
    const merged = {
      ...baseOptions,
      configurable: {
        ...(baseOptions.configurable ?? {}),
        thread_id:
          baseOptions.configurable?.thread_id ?? this.defaultThreadId,
      },
    };

    return merged;
  }
}

function messageContentToString(message: BaseMessage): string {
  const { content } = message;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === "string") {
          return chunk;
        }
        if (chunk && typeof chunk === "object") {
          if ("text" in chunk && typeof chunk.text === "string") {
            return chunk.text;
          }
          if ("value" in chunk && typeof chunk.value === "string") {
            return chunk.value;
          }
        }
        return "";
      })
      .join("")
      .trim();
  }

  return "";
}

export default ReactAgent;
