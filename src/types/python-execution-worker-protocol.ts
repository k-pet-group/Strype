import { z } from "zod";

// Messages from main thread to worker:
const ExecutePython = z.object({toWorker: z.literal("ExecutePython"), pythonCode: z.string()});
const ReceivedStdin = z.object({toWorker: z.literal("ReceivedStdin"), inputText: z.string()});

export const ToWorkerMessage = z.union([ReceivedStdin, ExecutePython]);

export type ToWorkerMessage = z.infer<typeof ToWorkerMessage>;
    
const WorkerReady = z.object({fromWorker: z.literal("WorkerReady")});
const PrintStdout = z.object({fromWorker: z.literal("PrintStdout"), outputText: z.string()});
const ExecutionFinished = z.object({fromWorker: z.literal("ExecutionFinished"), status: z.number()});

export const FromWorkerMessage = z.union([WorkerReady, PrintStdout, ExecutionFinished]);

export type FromWorkerMessage = z.infer<typeof FromWorkerMessage>;
