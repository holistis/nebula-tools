/**
 * Notebook tools for agent integration
 */
export async function readNotebookCells(params, client) {
    const result = await client.readNotebook(params.notebookPath);
    if (!result.success) {
        return { success: false, error: result.error };
    }
    const notebook = result.data;
    let cells = notebook.cells;
    if (params.cellIndices) {
        cells = params.cellIndices
            .filter((i) => i >= 0 && i < notebook.cells.length)
            .map((i) => notebook.cells[i]);
    }
    if (!params.includeOutputs) {
        cells = cells.map((c) => ({ ...c, outputs: undefined }));
    }
    return {
        success: true,
        data: {
            cells,
            totalCells: notebook.cells.length,
        },
    };
}
// WriteCellResult is imported from client.ts (no re-export to avoid conflicts)
export async function writeNotebookCell(params, client) {
    const result = await client.readNotebook(params.notebookPath);
    if (!result.success) {
        return { success: false, error: result.error };
    }
    const notebook = result.data;
    const cellType = params.cellType || 'code';
    const newCell = {
        id: `cell-${Date.now()}`,
        type: cellType,
        content: params.content,
        outputs: [],
    };
    if (params.cellIndex === -1) {
        // Append
        notebook.cells.push(newCell);
    }
    else if (params.cellIndex >= 0 && params.cellIndex < notebook.cells.length) {
        // Update existing
        notebook.cells[params.cellIndex] = {
            ...notebook.cells[params.cellIndex],
            content: params.content,
            type: cellType,
        };
    }
    else {
        return { success: false, error: `Invalid cell index: ${params.cellIndex}` };
    }
    const writeResult = await client.writeNotebook(notebook);
    if (!writeResult.success) {
        return { success: false, error: writeResult.error };
    }
    const finalIndex = params.cellIndex === -1 ? notebook.cells.length - 1 : params.cellIndex;
    const finalCellId = notebook.cells[finalIndex].id;
    return {
        success: true,
        data: {
            cellIndex: finalIndex,
            cellId: finalCellId,
            totalCells: notebook.cells.length,
        },
    };
}
export async function executeCell(params, client) {
    const result = await client.executeCode(params.sessionId, params.code);
    if (!result.success) {
        return { success: false, error: result.error };
    }
    return {
        success: true,
        data: {
            outputs: result.data.outputs,
            success: result.data.success,
            error: result.data.error,
        },
    };
}
/**
 * Simple keyword-based cell search (can be enhanced with embeddings later)
 */
export async function searchNotebookCells(params, client) {
    const result = await client.readNotebook(params.notebookPath);
    if (!result.success) {
        return { success: false, error: result.error };
    }
    const notebook = result.data;
    const limit = params.limit || 5;
    const queryLower = params.query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);
    // Score each cell by keyword overlap
    const scored = notebook.cells.map((cell, index) => {
        const contentLower = cell.content.toLowerCase();
        const outputText = (cell.outputs || [])
            .map((o) => o.content)
            .join(' ')
            .toLowerCase();
        const fullText = contentLower + ' ' + outputText;
        // Simple TF-based scoring
        let score = 0;
        for (const term of queryTerms) {
            const matches = (fullText.match(new RegExp(term, 'g')) || []).length;
            score += matches;
        }
        // Boost exact phrase match
        if (fullText.includes(queryLower)) {
            score += 10;
        }
        return {
            ...cell,
            index,
            score,
            outputs: params.includeOutputs ? cell.outputs : undefined,
        };
    });
    // Sort by score descending, filter out zero scores
    const results = scored
        .filter((c) => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    return {
        success: true,
        data: {
            cells: results,
            totalCells: notebook.cells.length,
        },
    };
}
// ===========================================================================
// Tool Definitions
// ===========================================================================
export const readCellsToolDefinition = {
    name: 'notebook_read_cells',
    description: 'Read cells from a Jupyter notebook',
    parameters: {
        type: 'object',
        properties: {
            notebookPath: { type: 'string', description: 'Path to the notebook file' },
            cellIndices: { type: 'array', description: 'Specific cell indices to read (0-indexed)', items: { type: 'number' } },
            includeOutputs: { type: 'boolean', description: 'Include cell outputs (default: false)' },
        },
        required: ['notebookPath'],
    },
};
export const writeCellToolDefinition = {
    name: 'notebook_write_cell',
    description: 'Write or update a cell in a Jupyter notebook',
    parameters: {
        type: 'object',
        properties: {
            notebookPath: { type: 'string', description: 'Path to the notebook file' },
            cellIndex: { type: 'number', description: 'Cell index to update (0-indexed), or -1 to append' },
            content: { type: 'string', description: 'Cell content' },
            cellType: { type: 'string', description: 'Cell type: "code" or "markdown"' },
        },
        required: ['notebookPath', 'cellIndex', 'content'],
    },
};
export const executeCellToolDefinition = {
    name: 'notebook_execute',
    description: 'Execute code in a notebook kernel session',
    parameters: {
        type: 'object',
        properties: {
            sessionId: { type: 'string', description: 'Kernel session ID' },
            code: { type: 'string', description: 'Code to execute' },
        },
        required: ['sessionId', 'code'],
    },
};
export const searchCellsToolDefinition = {
    name: 'notebook_search',
    description: 'Search notebook cells by keyword (for finding relevant context)',
    parameters: {
        type: 'object',
        properties: {
            notebookPath: { type: 'string', description: 'Path to the notebook file' },
            query: { type: 'string', description: 'Search query' },
            limit: { type: 'number', description: 'Max results (default: 5)' },
            includeOutputs: { type: 'boolean', description: 'Include cell outputs' },
        },
        required: ['notebookPath', 'query'],
    },
};
//# sourceMappingURL=tools.js.map