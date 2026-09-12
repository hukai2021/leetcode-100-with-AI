export type Language = 'python' | 'cpp' | 'sql';
export type Collection = 'hot100' | 'sql50';
export type SqlTable = { name:string; columns:{name:string;type:string}[] };
export type SqlResult = { columns:string[]; rows:any[][] };
export type Problem = { id: string; displayId?: string; kind?: 'algorithm'|'sql'; collection?: Collection; sql?: {dialect:'sqlite'; tables:SqlTable[]; orderMatters:boolean; orderBy?:{column:string;direction:'asc'|'desc'}[]; mode?:'query'|'delete'; resultTable?:string; dialectNotes?:string}; title: string; slug: string; difficulty: string; category: string; tags: string[]; url: string; content: string; contentFormat?: string; templates: Partial<Record<Language,string>>; available?: boolean; meta?: any; source?: { url?:string; verifiedAt?:string; contentUrl?:string; contentLanguage?:string; contentMethod?:string; translation?: {kind:string; translatedAt:string; originalLanguage:string; originalSha256:string}; method?:string }; };
export type ProblemState = { drafts: Partial<Record<Language,string>>; notes: string; favorite: boolean; status: 'todo'|'doing'|'done'; review: boolean; };
export type TestCase = { input: any; expected: any; source?: string };
export type Message = { id: string; role: string; text: string; createdAt?: string; status?: string; submissionId?: string; error?: string };
export type Submission = { id: string; code: string; language: Language; tests: any; review?: string; createdAt: string; status?: string; model?: string };
export type Bootstrap = { problems: Problem[]; cases: Record<string,TestCase[]>; states: Record<string,ProblemState>; settings: Record<string,any>; account: any; runtime: any; active: Record<string,any> };
declare global { interface Window { coach: { invoke: (method:string, params?:any)=>Promise<any>; onEvent: (callback:(event:any)=>void)=>()=>void }; MonacoEnvironment: any; } }
