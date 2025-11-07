import { ChatOpenAI } from "@langchain/openai";
import { createLLM } from "../utils/create_llm";
import { MemorySaver } from "@langchain/langgraph";
import { StructuredToolInterface } from "@langchain/core/tools";
import { createSrtTools } from "../tool/srt_tools";
import { createGetOutlineTool } from "../tool/simple_read_file_tool";
import { SystemMessage } from "@langchain/core/messages";
import ReactAgent from "../agent/react_agent_base";
import { PostgreSQLPersistentStorage } from "../storage/persistent_storage";


type CourseAgentOptions = {
    llm?: ChatOpenAI;
    threadId?: string;
    courseOutline: string;
    srtPath: string;
    plannerSystemPrompt: string;
    postgresStorage?: PostgreSQLPersistentStorage;
    enablePostgresPersistence?: boolean;
};

const DEFAULT_THREAD_ID = "course-agent-thread";



/**
 * 创建带有 PostgreSQL 持久化的课程代理（简化版）
 */
export function createPersistentCourseAgent(
    srtPath: string,
    courseOutline: string, 
    plannerSystemPrompt: string,
    options?: {
        llm?: ChatOpenAI;
        threadId?: string;
        postgresStorage?: PostgreSQLPersistentStorage;
    }
): Promise<ReactAgent> {
    return createCourseAgent({
        srtPath,
        courseOutline,
        plannerSystemPrompt,
        llm: options?.llm,
        threadId: options?.threadId,
        postgresStorage: options?.postgresStorage,
        enablePostgresPersistence: true,
    });
}

/**
 * 创建仅使用内存存储的课程代理（简化版）
 */
export function createMemoryCourseAgent(
    srtPath: string,
    courseOutline: string,
    plannerSystemPrompt: string,
    options?: {
        llm?: ChatOpenAI;
        threadId?: string;
    }
): Promise<ReactAgent> {
    return createCourseAgent({
        srtPath,
        courseOutline,
        plannerSystemPrompt,
        llm: options?.llm,
        threadId: options?.threadId,
        enablePostgresPersistence: false,
    });
}

async function createCourseAgent(options: CourseAgentOptions): Promise<ReactAgent> {
    const { srtPath, courseOutline, postgresStorage, enablePostgresPersistence = true } = options;
    
    if (!srtPath || !courseOutline) {
        throw new Error("srtPath or courseOutline must be provided to createCourseAgent.");
    }

    const llm = options.llm ?? createLLM();
    const threadId = options.threadId ?? DEFAULT_THREAD_ID;
    
    // 设置持久化存储
    let checkpointer: MemorySaver | PostgreSQLPersistentStorage;
    let storage: PostgreSQLPersistentStorage | undefined;
    if (postgresStorage && enablePostgresPersistence) {
        storage = postgresStorage;
        if (!storage.isConnected()) {
            await storage.connect();
        }
        checkpointer = storage;
    } else {
        checkpointer = new MemorySaver();
        console.log("🧠 Course Agent 使用内存存储（会话将不会持久化）");
    }

    // 创建工具
    const tools: StructuredToolInterface[] = [...createSrtTools(srtPath)];
    tools.push(createGetOutlineTool(courseOutline));

    const prompt = new SystemMessage(options.plannerSystemPrompt);

    return new ReactAgent({
        llm,
        prompt,
        tools,
        // checkpointSaver: checkpointer,
        defaultThreadId: threadId,
        postgresStorage: storage,
    });
}