export type RTL = {
    applyArabicShaping(input: string): string;
    processBidirectionalText(input: string, lineBreakPoints: number[]): string[];
    processStyledBidirectionalText(input: string, styleIndices: number[], lineBreakPoints: number[]): [string, number[]][];
};

export function createRTL(source: Response | PromiseLike<Response>): Promise<RTL>;
