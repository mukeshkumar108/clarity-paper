export const FREE_LIMITS = {
  maxWordCount: Infinity,
  maxPageCount: Infinity,
  maxDocumentsPerMonth: Infinity,
  maxQuestionsPerDocument: Infinity,
  maxKeyPoints: Infinity,
};

export const PRO_LIMITS = {
  maxWordCount: Infinity,
  maxPageCount: Infinity,
  maxDocumentsPerMonth: Infinity,
  maxQuestionsPerDocument: Infinity,
  maxKeyPoints: Infinity,
};

export function getLimits(plan: string) {
  return plan === "pro" ? PRO_LIMITS : FREE_LIMITS;
}
