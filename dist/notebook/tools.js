/**
 * Notebook tools for agent integration
 */
export async function readNotebookCells(params, client) {
    const result = await client.readNotebookViaRouter(params.notebookPath);
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
    const cellType = params.cellType || 'code';
    if (params.cellIndex === -1) {
        // Append new cell
        const newCell = {
            id: `cell-${Date.now()}`,
            type: cellType,
            content: params.content,
        };
        const insertResult = await client.insertCellOp(params.notebookPath, -1, newCell);
        if (!insertResult.success) {
            return { success: false, error: insertResult.error };
        }
        // Get total cell count
        const notebookResult = await client.readNotebookViaRouter(params.notebookPath);
        const totalCells = notebookResult.success ? notebookResult.data.cells.length : insertResult.data.cellIndex + 1;
        return {
            success: true,
            data: {
                cellIndex: insertResult.data.cellIndex,
                cellId: insertResult.data.cellId,
                totalCells,
            },
        };
    }
    else {
        // Update existing cell - first read to get cell id and validate index
        const readResult = await client.readCellOp(params.notebookPath, { cellIndex: params.cellIndex });
        if (!readResult.success) {
            return { success: false, error: readResult.error || `Invalid cell index: ${params.cellIndex}` };
        }
        const cellId = readResult.data.cell.id;
        // Update content
        const contentResult = await client.updateContentOp(params.notebookPath, cellId, params.content);
        if (!contentResult.success) {
            return { success: false, error: contentResult.error };
        }
        // Update type if different
        if (cellType !== readResult.data.cell.type) {
            const metaResult = await client.updateMetadataOp(params.notebookPath, cellId, { type: cellType });
            if (!metaResult.success) {
                return { success: false, error: metaResult.error };
            }
        }
        // Get total cell count
        const notebookResult = await client.readNotebookViaRouter(params.notebookPath);
        const totalCells = notebookResult.success ? notebookResult.data.cells.length : params.cellIndex + 1;
        return {
            success: true,
            data: {
                cellIndex: params.cellIndex,
                cellId,
                totalCells,
            },
        };
    }
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
    const result = await client.readNotebookViaRouter(params.notebookPath);
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
/**
 * Read a single cell from a notebook.
 * More efficient than reading the entire notebook when you only need one cell.
 */
export async function readCell(params, client) {
    if (!params.cellId && params.cellIndex === undefined) {
        return { success: false, error: 'Must provide cellId or cellIndex' };
    }
    const result = await client.readCellOp(params.notebookPath, {
        cellId: params.cellId,
        cellIndex: params.cellIndex,
    });
    if (!result.success) {
        return { success: false, error: result.error };
    }
    return {
        success: true,
        data: {
            cell: result.data.cell,
            cellIndex: result.data.cellIndex,
        },
    };
}
export const readCellToolDefinition = {
    name: 'notebook_read_cell',
    description: 'Read a single cell from a notebook by ID or index. More efficient than reading the entire notebook.',
    parameters: {
        type: 'object',
        properties: {
            notebookPath: { type: 'string', description: 'Path to the notebook file' },
            cellId: { type: 'string', description: 'Cell ID to read' },
            cellIndex: { type: 'number', description: 'Cell index to read (0-indexed)' },
        },
        required: ['notebookPath'],
    },
};
/**
 * Read outputs from a single cell.
 * More efficient than reading the entire notebook when you only need cell outputs.
 */
export async function readCellOutput(params, client) {
    if (!params.cellId && params.cellIndex === undefined) {
        return { success: false, error: 'Must provide cellId or cellIndex' };
    }
    const result = await client.readCellOutputOp(params.notebookPath, {
        cellId: params.cellId,
        cellIndex: params.cellIndex,
    });
    if (!result.success) {
        return { success: false, error: result.error };
    }
    return {
        success: true,
        data: {
            cellId: result.data.cellId,
            cellIndex: result.data.cellIndex,
            outputs: result.data.outputs,
            executionCount: result.data.executionCount,
        },
    };
}
export const readCellOutputToolDefinition = {
    name: 'notebook_read_cell_output',
    description: 'Read outputs from a single cell by ID or index. More efficient than reading the entire notebook.',
    parameters: {
        type: 'object',
        properties: {
            notebookPath: { type: 'string', description: 'Path to the notebook file' },
            cellId: { type: 'string', description: 'Cell ID to read outputs from' },
            cellIndex: { type: 'number', description: 'Cell index to read outputs from (0-indexed)' },
        },
        required: ['notebookPath'],
    },
};
//# sourceMappingURL=tools.js.map