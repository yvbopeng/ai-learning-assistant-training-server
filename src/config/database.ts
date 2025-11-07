

import { DataSource } from 'typeorm';
import { User } from '../models/user';
import { Title } from '../models/title';
import { LearningRecord } from '../models/learningRecord';
import { DailySummary } from '../models/dailySummary';
import { CourseSchedule } from '../models/courseSchedule';
import { AiInteraction } from '../models/aiInteraction';
import { AiPersona } from '../models/aiPersona';
import { Course } from '../models/course';
import { Chapter } from '../models/chapter';
import { Section } from '../models/section';
import { LeadingQuestion } from '../models/leadingQuestion';
import { Exercise } from '../models/exercise';
import { ExerciseOption } from '../models/exerciseOption';
import { Test } from '../models/test';
import { TestResult } from '../models/testResult';
import { ExerciseResult } from '../models/exerciseResult';
import { TestExercise } from '../models/testExercise';
import { UserSessionMapping } from '../models/UserSessionMapping';
import { ConversationAnalytics } from '../models/ConversationAnalytics';
import dotenv from 'dotenv';
import { Client } from 'pg';
dotenv.config();

const {
  DB_HOST = '',
  DB_PORT = '',
  DB_NAME = '',
  DB_USER = '',
  DB_PASSWORD = '',
} = process.env;

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: DB_HOST,
  port: parseInt(DB_PORT),
  username: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  synchronize: true, // 生产环境建议关闭
  logging: false,
  entities: [
    User, Title, LearningRecord, DailySummary, CourseSchedule, AiInteraction,
    AiPersona, Course, Chapter, Section, LeadingQuestion,
    Exercise, ExerciseOption, Test, TestResult, ExerciseResult, TestExercise,
    UserSessionMapping, ConversationAnalytics
  ], // 创建model后要在此处添加
  migrations: [],
  subscribers: [],
});


// 启动时自动检查并创建数据库（如不存在）
async function ensureDatabaseExists() {
  const client = new Client({
    host: DB_HOST,
    port: parseInt(DB_PORT),
    user: DB_USER,
    password: DB_PASSWORD,
    database: 'postgres',
  });
  try {
    await client.connect();
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${DB_NAME}"`);
      console.log(`✅ 数据库 ${DB_NAME} 创建成功`);
    } else {
      console.log(`ℹ️ 数据库 ${DB_NAME} 已存在`);
    }
  } catch (err) {
    console.error('❌ 检查/创建数据库失败:', err);
    throw err;
  } finally {
    await client.end();
  }
}

export const connectDatabase = async () => {
  try {
    await ensureDatabaseExists();
    await AppDataSource.initialize();
    console.log('✅ TypeORM 数据库连接成功');
  } catch (error) {
    console.error('❌ TypeORM 数据库连接失败:', error);
    throw error;
  }
};
