

/**
 * PostgreSQL 持久化存储管理器
 */
export class PostgreSQLPersistentStorage {
  private connected = false;

  constructor() {
    // TypeORM 由 AppDataSource 管理连接
  }

  /**
   * 连接到 PostgreSQL 数据库并初始化 checkpoint saver
   */
  async connect(): Promise<void> {
    // TypeORM 连接由 AppDataSource 管理
    this.connected = true;
  }

  /**
   * 断开数据库连接
   */
  async disconnect(): Promise<void> {
    // TypeORM 连接由 AppDataSource 管理
    this.connected = false;
  }

  /**
   * 获取 PostgresSaver 实例
   */
  // getSaver 已废弃

  /**
   * 检查连接状态
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 设置自定义数据库表
   */
  // 自定义表结构迁移到 TypeORM 实体，自动同步

  /**
   * 创建用户会话映射表
   */
  // ...已迁移到 models/UserSessionMapping.ts ...

  /**
   * 创建对话分析表
   */
  // ...已迁移到 models/ConversationAnalytics.ts ...

  /**
   * 映射用户ID到线程ID
   */
  /**
   * 使用 TypeORM 实体映射用户ID到线程ID
   */
  async mapUserToThread(userId: string, threadId: string, metadata?: any): Promise<void> {
    const { AppDataSource } = await import('../../config/database');
    const repo = AppDataSource.getRepository(require('../../models/UserSessionMapping').UserSessionMapping);
    let mapping = await repo.findOne({ where: { user_id: userId, thread_id: threadId } });
    if (!mapping) {
      mapping = repo.create({ user_id: userId, thread_id: threadId, metadata });
    } else {
      mapping.metadata = metadata;
      mapping.updated_at = new Date();
    }
    await repo.save(mapping);
  }

  /**
   * 获取用户的所有会话线程
   */
  /**
   * 使用 TypeORM 实体获取用户所有会话线程
   */
  async getUserThreads(userId: string): Promise<Array<{ threadId: string; createdAt: Date; updatedAt: Date; metadata?: any }>> {
    const { AppDataSource } = await import('../../config/database');
    const repo = AppDataSource.getRepository(require('../../models/UserSessionMapping').UserSessionMapping);
    const records = await repo.find({ where: { user_id: userId }, order: { updated_at: 'DESC' } });
    return records.map((row: any) => ({
      threadId: row.thread_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      metadata: row.metadata
    }));
  }

  /**
   * 更新对话分析数据
   */
  /**
   * 使用 TypeORM 实体更新对话分析数据
   */
  async updateConversationAnalytics(
    sessionId: string,
    userId: string,
    conversationSummary: string,
    analyticsData: any
  ): Promise<void> {
    const { AppDataSource } = await import('../../config/database');
    const repo = AppDataSource.getRepository(require('../../models/ConversationAnalytics').ConversationAnalytics);
    let analytics = await repo.findOne({ where: { session_id: sessionId, user_id: userId } });
    if (!analytics) {
      analytics = repo.create({ session_id: sessionId, user_id: userId, conversation_summary: conversationSummary, analytics_data: analyticsData });
    } else {
      analytics.conversation_summary = conversationSummary;
      analytics.analytics_data = analyticsData;
      analytics.updated_at = new Date();
    }
    await repo.save(analytics);
  }

  /**
   * 获取对话分析数据
   */
  /**
   * 使用 TypeORM 实体获取对话分析数据
   */
  async getConversationAnalytics(sessionId: string, userId: string): Promise<any> {
    const { AppDataSource } = await import('../../config/database');
    const repo = AppDataSource.getRepository(require('../../models/ConversationAnalytics').ConversationAnalytics);
    return await repo.findOne({ where: { session_id: sessionId, user_id: userId } });
  }

  /**
   * 清理过期的会话数据
   */
  /**
   * 使用 TypeORM 实体清理过期的会话数据
   */
  async cleanupExpiredSessions(daysOld: number = 30): Promise<number> {
    const { AppDataSource } = await import('../../config/database');
    const repo = AppDataSource.getRepository(require('../../models/UserSessionMapping').UserSessionMapping);
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const result = await repo.createQueryBuilder()
      .delete()
      .where('updated_at < :cutoff', { cutoff })
      .execute();
    return result.affected || 0;
  }

  /**
   * 获取数据库连接池实例（用于高级操作）
   */
  // getPool 已废弃
}

