/**
 * IDE Client stub
 */

export interface DiffUpdateResult {
    status: 'accepted' | 'rejected' | 'cancelled';
    content?: string;
}

export class IdeClient {
    private static instance: IdeClient | null = null;

    static async getInstance(): Promise<IdeClient> {
        if (!IdeClient.instance) {
            IdeClient.instance = new IdeClient();
        }
        return IdeClient.instance;
    }

    isDiffingEnabled(): boolean {
        return false; // Disabled in IDE context - use built-in diff
    }

    async openDiff(_filePath: string, _newContent: string): Promise<DiffUpdateResult> {
        return { status: 'accepted' };
    }
}
