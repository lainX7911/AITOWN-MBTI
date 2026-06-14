import type { RolePreset } from './types';

export function isFuturePartnerQuestionForDisplay(question: string) {
  return (
    /找一个?伴侣|找伴侣|找对象|找女朋友|找一个?老婆|找老婆|什么样的女人|什么样的人适合|适合我/.test(question) &&
    /考虑|是否|想|未来|明年|退休|一起生活|共同生活|适合|一定要找/.test(question)
  );
}

export function objectSummaryForQuestion(question: string, roles: RolePreset[]) {
  const enabledLabels = roles
    .filter((role) => role.enabled)
    .map((role) => role.label.trim())
    .filter(Boolean);
  if (enabledLabels.length > 0) {
    return enabledLabels.join('、');
  }
  return isFuturePartnerQuestionForDisplay(question) ? '意向对象（本轮候选）' : '未设置';
}

export function objectModeHintForQuestion(question: string, userEntryMode: string, roles: RolePreset[]) {
  if (roles.some((role) => role.enabled)) {
    return `进入模式：${userEntryMode}。带入对象只作为本次临时参与者。`;
  }
  if (isFuturePartnerQuestionForDisplay(question)) {
    return '进入模式：solo。系统会创建“意向对象”作为本轮临时候选，不代表现任伴侣。';
  }
  return `进入模式：${userEntryMode}。本轮没有显式带入关系对象。`;
}
