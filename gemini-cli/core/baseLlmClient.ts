/**
 * Base LLM client stub
 * Smart-edit uses this for LLM-powered self-correction of failed edits
 */

export interface BaseLlmClient {
    generateJson(params: {
        modelConfigKey: { model: string };
        contents: Array<{ role: string; parts: Array<{ text: string }> }>;
        schema: any;
        abortSignal?: AbortSignal;
        systemInstruction?: string;
        promptId?: string;
        maxAttempts?: number;
    }): Promise<any>;
}

/**
 * Stub LLM client that returns null (disables LLM-powered features)
 */
export class StubBaseLlmClient implements BaseLlmClient {
    async generateJson(_params: any): Promise<any> {
        // Return null to indicate LLM is not available
        // Smart-edit will fall back to returning the original error
        return null;
    }
}
