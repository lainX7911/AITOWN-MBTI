import {
  startupQuestionMaxSelections,
  toggleStartupOption,
} from './startupQuestions';

describe('startup question choices', () => {
  test('infers multi-select for questions asking for three things', () => {
    expect(startupQuestionMaxSelections({
      question: '如果明天就回到岳阳，你第一周最想做的三件事是什么？',
      options: ['睡到自然醒', '逛菜市场', '找老朋友喝酒聊天', '把家里打扫一遍'],
    })).toBe(3);
  });

  test('keeps ordinary startup questions single-select', () => {
    expect(toggleStartupOption(['睡到自然醒'], '逛菜市场', 1)).toEqual(['逛菜市场']);
  });

  test('keeps the latest selected items within the multi-select limit', () => {
    expect(toggleStartupOption(['A', 'B', 'C'], 'D', 3)).toEqual(['B', 'C', 'D']);
  });
});
