export type StartupQuestionChoice = {
  question: string;
  options: string[];
  maxSelections?: number;
};

export function startupQuestionMaxSelections(question: StartupQuestionChoice) {
  const explicit = typeof question.maxSelections === 'number' && Number.isFinite(question.maxSelections)
    ? Math.floor(question.maxSelections)
    : 1;
  const inferred = inferStartupQuestionMaxSelections(question.question);
  return Math.min(Math.max(explicit, inferred, 1), Math.max(1, question.options.length));
}

export function inferStartupQuestionMaxSelections(question: string) {
  if (/三件|三个|3\s*个/.test(question)) {
    return 3;
  }
  if (/两件|两个|2\s*个/.test(question)) {
    return 2;
  }
  if (/几件|几个|哪些|哪几|清单|优先级/.test(question)) {
    return 3;
  }
  return 1;
}

export function toggleStartupOption(current: string[], option: string, maxSelections: number) {
  if (current.includes(option)) {
    return current.filter((item) => item !== option);
  }
  if (maxSelections <= 1) {
    return [option];
  }
  return [...current, option].slice(-maxSelections);
}
