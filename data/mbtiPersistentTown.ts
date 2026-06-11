export type MbtiWeights = {
  e: number;
  i: number;
  s: number;
  n: number;
  t: number;
  f: number;
  j: number;
  p: number;
};

export type TownLocationSeed = {
  key: string;
  name: string;
  affordances: string[];
  description: string;
};

export type TownResidentSeed = {
  key: string;
  name: string;
  role: string;
  mbtiCode: string;
  weights: MbtiWeights;
  traits: string[];
  background: string;
  defaultLocationKey: string;
  scheduleTags: string[];
};

export type TownRelationshipSeed = {
  residentAKey: string;
  residentBKey: string;
  familiarity: number;
  trust: number;
  warmth: number;
  tension: number;
  influence: number;
  summary: string;
};

export type TownMemorySeed = {
  kind: 'public' | 'conflict' | 'favor' | 'rumor' | 'routine' | 'scene' | 'user';
  salience: number;
  title: string;
  summary: string;
  residentKeys: string[];
  locationKey?: string;
};

export type SceneType =
  | 'relationship'
  | 'friendship_pressure'
  | 'workplace_conflict'
  | 'family'
  | 'uncertainty'
  | 'repair'
  | 'decision';

export type UserEntryMode = 'solo' | 'with_partner' | 'with_friend' | 'with_partner_and_friend';

export type SceneSelectionInput = {
  question: string;
  userEntryMode: UserEntryMode;
  residents: TownResidentSeed[];
  relationships: TownRelationshipSeed[];
  memories: TownMemorySeed[];
  locations: TownLocationSeed[];
};

export type SceneSelection = {
  sceneType: SceneType;
  locationKey: string;
  residentKeys: string[];
  questionFocus: QuestionFocus;
  rationale: string[];
};

export type QuestionFocus = {
  coreQuestion: string;
  drivingTension: string;
  observationGoal: string;
  analysisDimensions?: string[];
  designRationale?: string;
  theoreticalBasis?: string[];
  evidenceTargets: string[];
  eventBeats: string[];
  eventPlans?: Array<{
    title: string;
    scene: string;
    trigger: string;
    participants: string[];
    observationAxis?: string;
    questionLink?: string;
    informationGoal: string;
    judgmentSignal: string;
  }>;
  resolutionCriteria: string;
};

const MIN_ACTIVE_RESIDENTS = 4;
const MAX_ACTIVE_RESIDENTS = 6;

export const defaultTownLocations: TownLocationSeed[] = [
  {
    key: 'cafe',
    name: '晨桥咖啡馆',
    affordances: ['relationship', 'friendship_pressure', 'uncertainty', 'repair'],
    description: '人来人往但仍能低声谈话，适合暧昧、朋友建议和修复关系。',
  },
  {
    key: 'square',
    name: '钟楼广场',
    affordances: ['public', 'decision', 'friendship_pressure'],
    description: '小镇公共空间，容易遇到旁观者和流动消息。',
  },
  {
    key: 'clinic',
    name: '白榆诊所',
    affordances: ['family', 'repair', 'uncertainty'],
    description: '安静、克制，适合谈压力、照顾和边界。',
  },
  {
    key: 'school',
    name: '旧校舍',
    affordances: ['workplace_conflict', 'decision', 'public'],
    description: '社区课程和会议常在这里发生，公开评价压力更高。',
  },
  {
    key: 'riverside',
    name: '河边步道',
    affordances: ['relationship', 'uncertainty', 'repair'],
    description: '适合边走边说，不容易被打断。',
  },
  {
    key: 'hallway',
    name: '公寓走廊',
    affordances: ['relationship', 'family', 'conflict'],
    description: '半私密空间，误会和临时碰面经常发生。',
  },
  {
    key: 'workshop',
    name: '修理工坊',
    affordances: ['workplace_conflict', 'decision', 'repair'],
    description: '重视事实、责任和实际解决方案。',
  },
  {
    key: 'office',
    name: '社区办公室',
    affordances: ['workplace_conflict', 'decision', 'public'],
    description: '适合协商、分工和处理公开压力。',
  },
];

export const defaultTownResidents: TownResidentSeed[] = [
  resident('lin_yao', '林遥', '咖啡馆店主', 'ENFJ', 'cafe', ['热心', '会记住熟客的小事', '善于缓和尴尬'], '常把别人没说出口的情绪放在心上。'),
  resident('zhou_mian', '周眠', '夜班护士', 'ISFJ', 'clinic', ['谨慎', '照顾型', '不轻易评价'], '见过很多关系里的疲惫，倾向先确认对方有没有被好好照顾。'),
  resident('xu_an', '许岸', '修理工', 'ISTP', 'workshop', ['话少', '看行动', '讨厌空泛承诺'], '更相信稳定行动，不喜欢把问题说得过度复杂。'),
  resident('chen_qiao', '陈桥', '社区组织者', 'ENTJ', 'office', ['直接', '重秩序', '推动决策'], '会把模糊关系看成需要澄清的协作问题。'),
  resident('he_yu', '何雨', '小学老师', 'INFJ', 'school', ['敏感', '看长期模式', '容易过度承担'], '擅长读懂气氛，但也会把别人的沉默背到自己身上。'),
  resident('tang_xi', '唐溪', '自由插画师', 'INFP', 'riverside', ['理想化', '重意义', '慢热'], '会用故事理解关系，也容易被含糊信号牵动。'),
  resident('gao_sheng', '高声', '外卖站长', 'ESTP', 'square', ['行动快', '爱开玩笑', '冲突后恢复快'], '倾向先见面解决，不喜欢隔着手机猜。'),
  resident('wen_li', '温理', '账房/会计', 'ISTJ', 'office', ['守时', '记细节', '重承诺'], '对临时变动很敏感，会把反复失约视为可信度问题。'),
  resident('luo_qing', '罗晴', '心理咨询实习生', 'INFJ', 'clinic', ['克制', '倾听', '会追问动机'], '习惯区分事实、感受和解释。'),
  resident('mei_zhi', '梅枝', '退休裁缝', 'ESFJ', 'hallway', ['邻里消息灵通', '护短', '重礼数'], '记得很多旧事，常用过去的例子劝人。'),
  resident('yan_ke', '严可', '产品经理', 'INTJ', 'office', ['结构化', '怀疑直觉', '看长期代价'], '会把情绪问题拆成信号、风险和选择。'),
  resident('song_chi', '宋迟', '乐队鼓手', 'ENFP', 'square', ['热烈', '容易共情', '放大可能性'], '能迅速带动气氛，也可能把小事讲得更戏剧化。'),
  resident('bai_mu', '白牧', '图书管理员', 'INTP', 'school', ['旁观', '追求解释', '不爱站队'], '常提醒大家证据不足，但说话不够安抚。'),
  resident('qiao_nan', '乔南', '健身教练', 'ESTJ', 'square', ['边界清楚', '重执行', '保护朋友'], '看到拖延和含糊会直接建议设规则。'),
  resident('su_ning', '苏宁', '花店店员', 'ISFP', 'cafe', ['温柔', '回避冲突', '重当下感受'], '不喜欢逼问，但会用小动作表达支持。'),
  resident('liang_ce', '梁策', '律师助理', 'ENTP', 'office', ['辩论型', '挑战假设', '喜欢反例'], '经常逼别人说清真正害怕的是什么。'),
  resident('jin_yue', '金月', '研究生', 'INTP', 'school', ['分析型', '慢热', '事实优先'], '会提醒别人不要把一次延迟当成完整人格证据。'),
  resident('fan_rui', '樊瑞', '社区医生', 'ISTJ', 'clinic', ['稳定', '低调', '有耐心'], '倾向先把情况说完整，再决定怎么回应。'),
  resident('yu_lan', '俞岚', '民宿老板', 'ESFP', 'hallway', ['外向', '会照顾场面', '不耐沉闷'], '擅长把紧张场面转成可说出口的话。'),
  resident('pei_xun', '裴循', '摄影师', 'ISFP', 'riverside', ['观察细', '表达慢', '情绪含蓄'], '看得到别人微小变化，但常不知道该不该说破。'),
  resident('han_zhi', '韩直', '物流协调员', 'ESTJ', 'workshop', ['效率高', '责任感强', '说话硬'], '会把反复犹豫视为消耗。'),
  resident('ning_su', '宁素', '社工', 'ENFJ', 'office', ['整合资源', '照顾弱势', '推动和解'], '会邀请关键的人坐下来谈，但不喜欢逼迫。'),
  resident('du_mo', '杜墨', '独居作家', 'INTJ', 'riverside', ['疏离', '洞察强', '不爱寒暄'], '容易看穿关系里的权力和逃避。'),
  resident('xia_yue', '夏越', '大学生', 'ENFP', 'cafe', ['好奇', '情绪外显', '容易站朋友立场'], '常把朋友的事当成自己的事着急。'),
  resident('shi_yuan', '石远', '木工', 'ISTP', 'workshop', ['实干', '沉默可靠', '不擅表达'], '认为修复关系要看后续行动。'),
  resident('qin_bei', '秦蓓', '社区记者', 'ENTP', 'square', ['追问', '消息快', '喜欢多角度'], '会把私人问题放进更大的社会观察里。'),
  resident('miao_sen', '苗森', '园艺师', 'ISFJ', 'riverside', ['稳定', '慢节奏', '记恩情'], '常用日常照料表达亲近。'),
  resident('zhao_heng', '赵衡', '前公司主管', 'ENTJ', 'office', ['强势', '讲结果', '不怕冲突'], '容易把犹豫的人推向立即选择。'),
];

export const defaultTownMemories: TownMemorySeed[] = [
  memory('public', 76, '春季集市的迟到风波', '陈桥临时改了摊位安排，温理记到现在，认为公开承诺不能随便变。', ['chen_qiao', 'wen_li'], 'square'),
  memory('conflict', 82, '旧校舍会议争执', '乔南曾当众质疑宋迟不靠谱，后来靠宁素调停才没有继续升级。', ['qiao_nan', 'song_chi', 'ning_su'], 'school'),
  memory('favor', 68, '夜雨修门', '许岸在暴雨夜帮梅枝修好走廊门锁，梅枝之后很信任他的判断。', ['xu_an', 'mei_zhi'], 'hallway'),
  memory('routine', 55, '河边晚走', '唐溪、裴循和苗森常在傍晚沿河走路，很多心事会在那时慢慢说出来。', ['tang_xi', 'pei_xun', 'miao_sen'], 'riverside'),
  memory('rumor', 64, '咖啡馆的未回消息', '夏越听说有人因为连续不回消息分开，之后对延迟回应特别敏感。', ['xia_yue', 'lin_yao'], 'cafe'),
  memory('public', 58, '社区办公室排班', '韩直和陈桥合作过排班系统，两人都重效率，但说话方式常让旁人紧张。', ['han_zhi', 'chen_qiao'], 'office'),
  memory('favor', 72, '诊所陪同', '周眠曾陪苏宁处理家庭急事，苏宁因此在压力场景里更愿意听周眠的话。', ['zhou_mian', 'su_ning'], 'clinic'),
  memory('conflict', 79, '采访边界', '秦蓓追问过一段私人矛盾，被杜墨批评越界，两人至今互相警惕。', ['qin_bei', 'du_mo'], 'square'),
  memory('routine', 61, '工坊午后', '石远、许岸和韩直常在工坊沉默做事，遇到问题会先看事实和工具。', ['shi_yuan', 'xu_an', 'han_zhi'], 'workshop'),
  memory('public', 66, '家属照护讨论', '白榆诊所办过照护讲座，罗晴提醒大家不要把控制误认为关心。', ['luo_qing', 'fan_rui', 'zhou_mian'], 'clinic'),
  memory('rumor', 50, '民宿走廊的争吵', '俞岚听见过一对伴侣在走廊争吵，后来她总会先帮双方降温。', ['yu_lan'], 'hallway'),
  memory('favor', 59, '图书馆资料', '白牧帮严可找过长期关系研究资料，两人都相信单次事件不能决定结论。', ['bai_mu', 'yan_ke'], 'school'),
  memory('conflict', 70, '项目责任推诿', '赵衡曾把一个失败项目归咎给同事，梁策当场追问证据，办公室气氛很僵。', ['zhao_heng', 'liang_ce'], 'office'),
  memory('routine', 48, '咖啡馆角桌', '林遥会把需要安静谈话的人安排到角桌，也会留意谁频繁看手机。', ['lin_yao'], 'cafe'),
  memory('public', 62, '广场临时演出', '高声和宋迟曾用一场临时演出化解排队冲突，小镇里有人觉得他们太吵但有效。', ['gao_sheng', 'song_chi'], 'square'),
  memory('favor', 67, '花店道歉卡', '苏宁帮乔南写过一张道歉卡，让乔南第一次承认自己说话太硬。', ['su_ning', 'qiao_nan'], 'cafe'),
  memory('rumor', 57, '旧关系复联', '梅枝说前任复联通常不是单一动机，唐溪听后一直记着这句话。', ['mei_zhi', 'tang_xi'], 'hallway'),
  memory('conflict', 74, '迟到三小时', '温理曾因朋友迟到三小时而直接结束合作，宁素认为她当时其实更需要解释。', ['wen_li', 'ning_su'], 'office'),
  memory('routine', 52, '晨间浇水', '苗森每天早晨浇水时会遇到很多居民，知道谁最近状态低落。', ['miao_sen'], 'riverside'),
  memory('public', 60, '学生社团求助', '何雨处理过学生关系冲突，倾向让双方先各自说出真实需求。', ['he_yu'], 'school'),
  memory('favor', 63, '相机借用', '裴循借相机给秦蓓，后来因为采访角度不一致，两人保持礼貌但不亲近。', ['pei_xun', 'qin_bei'], 'riverside'),
  memory('conflict', 69, '强行给建议', '夏越曾因为太急着保护朋友而激化矛盾，林遥提醒她先问对方想不想听建议。', ['xia_yue', 'lin_yao'], 'cafe'),
  memory('routine', 46, '安静读书会', '金月和白牧维持一个很安静的读书会，习惯先定义概念再讨论情绪。', ['jin_yue', 'bai_mu'], 'school'),
  memory('public', 65, '社区规则修订', '陈桥、赵衡和宁素讨论过公共规则，最后宁素坚持保留人情弹性。', ['chen_qiao', 'zhao_heng', 'ning_su'], 'office'),
];

export const defaultTownRelationships: TownRelationshipSeed[] = buildRelationships();

export function classifySceneType(question: string): SceneType {
  const text = question.toLowerCase();
  if (hasAny(text, ['同事', '上司', '老板', '客户', '工作', '项目', '公开表达不满'])) {
    return 'workplace_conflict';
  }
  if (hasAny(text, ['家人', '父母', '妈妈', '爸爸', '孩子', '亲戚'])) {
    return 'family';
  }
  if (hasAny(text, ['朋友', '闺蜜', '兄弟', '建议', '劝', '介入'])) {
    return 'friendship_pressure';
  }
  if (hasAny(text, ['道歉', '修复', '和好', '吵架', '误会'])) {
    return 'repair';
  }
  if (hasAny(text, ['要不要', '是否', '选择', '决定', '适合'])) {
    return 'decision';
  }
  if (hasAny(text, ['不回', '冷淡', '暧昧', '异地', '不确定', '忽冷忽热'])) {
    return 'uncertainty';
  }
  return 'relationship';
}

export function selectScene(input: SceneSelectionInput): SceneSelection {
  const sceneType = classifySceneType(input.question);
  const location = chooseLocation(sceneType, input.locations);
  const questionFocus = buildQuestionFocus(input.question, sceneType);
  const scored = input.residents
    .map((resident) => ({
      resident,
      score: scoreResident(resident, sceneType, location.key, input),
    }))
    .sort((a, b) => b.score - a.score || a.resident.key.localeCompare(b.resident.key));
  const selected: TownResidentSeed[] = [];
  for (const item of scored) {
    if (selected.length >= MAX_ACTIVE_RESIDENTS) {
      break;
    }
    if (item.score > 0 || selected.length < MIN_ACTIVE_RESIDENTS) {
      selected.push(item.resident);
    }
  }
  while (selected.length < MIN_ACTIVE_RESIDENTS && scored[selected.length]) {
    selected.push(scored[selected.length].resident);
  }
  return {
    sceneType,
    locationKey: location.key,
    residentKeys: selected.slice(0, MAX_ACTIVE_RESIDENTS).map((resident) => resident.key),
    questionFocus,
    rationale: [
      `问题被归类为 ${sceneType} 场景。`,
      `地点选择 ${location.name}，因为它支持 ${location.affordances.join('、')}。`,
      `本轮观察目标：${questionFocus.observationGoal}`,
      `只激活 ${Math.min(selected.length, MAX_ACTIVE_RESIDENTS)} 位居民，其余居民保留为背景关系和记忆。`,
    ],
  };
}

function buildQuestionFocus(question: string, sceneType: SceneType): QuestionFocus {
  const text = question.trim();
  const focusByType: Record<SceneType, Omit<QuestionFocus, 'coreQuestion'>> = {
    relationship: {
      drivingTension: '关系里的真实需求和表达方式还不清楚。',
      observationGoal: '观察“我”会主动表达、等待、回避，还是通过第三方确认关系状态。',
      evidenceTargets: ['主动表达需求', '对沉默或含糊回应的反应', '是否能维持边界', '是否寻求修复'],
      eventBeats: ['亲密对象短暂离开', '旁人给出不同解读', '出现一次可以直接沟通的窗口'],
      resolutionCriteria: '至少出现一次压力反应、一次主线沟通和一次事后选择，才能形成倾向结论。',
    },
    friendship_pressure: {
      drivingTension: '朋友的意见可能保护“我”，也可能放大焦虑。',
      observationGoal: '观察“我”会被朋友带动、坚持自己的感受，还是在两种意见之间反复摇摆。',
      evidenceTargets: ['是否采纳朋友建议', '是否向关系对象核实', '是否区分事实和情绪', '是否表达自己的立场'],
      eventBeats: ['朋友插入建议', '关系对象给出不完整回应', '居民旁观评价这段关系'],
      resolutionCriteria: '需要同时看到朋友影响和主线对象回应，才能判断“我”的倾向。',
    },
    workplace_conflict: {
      drivingTension: '公开误解或责任压力会迫使“我”在事实、面子和关系之间选择。',
      observationGoal: '观察“我”会先澄清事实、先修复气氛、退开，还是寻找第三方支持。',
      evidenceTargets: ['事实核验', '公开场合压力反应', '修复表达', '边界和责任划分'],
      eventBeats: ['工作相关居民提出质疑', '出现公开评价', '给出一次私下解释机会'],
      resolutionCriteria: '至少有一次公开压力和一次澄清/修复尝试，结论才可靠。',
    },
    family: {
      drivingTension: '照顾、责任和个人空间之间存在拉扯。',
      observationGoal: '观察“我”会承担、设边界、寻求帮助，还是先压下自己的感受。',
      evidenceTargets: ['照顾行为', '边界表达', '向外求助', '压力后的恢复方式'],
      eventBeats: ['家庭式照顾事件', '旁人请求帮忙', '出现一次拒绝或延迟的选择'],
      resolutionCriteria: '需要看到“我”在责任和自我保护之间的实际选择。',
    },
    uncertainty: {
      drivingTension: '延迟、冷淡或含糊信号会放大不确定感。',
      observationGoal: '观察“我”会追问、脑内推演、转移注意，还是用行动确认事实。',
      evidenceTargets: ['对延迟回应的反应', '是否过度解读', '是否直接确认', '是否能回到自己的生活'],
      eventBeats: ['主线对象延迟回应', '第三方提供猜测', '出现一次对方重新靠近的机会'],
      resolutionCriteria: '需要同时出现不确定刺激和后续确认行为，才能判断倾向。',
    },
    repair: {
      drivingTension: '关系受损后，双方是否愿意承担和修复还不稳定。',
      observationGoal: '观察“我”会先要解释、先安抚、设边界，还是避免继续谈。',
      evidenceTargets: ['修复动机', '责任归因', '情绪安抚', '是否接受不完美回应'],
      eventBeats: ['对方尝试靠近', '居民提起类似旧冲突', '出现一次误会澄清窗口'],
      resolutionCriteria: '需要至少一次误会触发和一次修复窗口，才能输出倾向。',
    },
    decision: {
      drivingTension: '选择需要在现实代价、情绪需求和长期稳定之间权衡。',
      observationGoal: '观察“我”会收集事实、听从情绪、询问他人，还是推迟决定。',
      evidenceTargets: ['事实收集', '情绪优先级', '他人建议影响', '做决定或延迟决定'],
      eventBeats: ['居民给出现实代价提醒', '主线对象提出期待', '出现一次必须表态的小选择'],
      resolutionCriteria: '需要看到“我”面对小选择时的行动，而不只是口头分析。',
    },
  };
  return {
    coreQuestion: text,
    ...focusByType[sceneType],
    analysisDimensions: analysisDimensionsForScene(sceneType),
    designRationale: '系统先把用户问题拆成可观察的心理和行为维度，再用小镇事件分别制造压力、信息不足、他人介入和后续选择窗口。',
    theoreticalBasis: ['压力与应对', '认知行为', '行为激活', '社会支持'],
    eventPlans: buildFallbackEventPlans(sceneType),
  };
}

function analysisDimensionsForScene(sceneType: SceneType) {
  const dimensions: Record<SceneType, string[]> = {
    relationship: [
      '关系对象不配合时是否表达边界',
      '信息不足时是追问还是脑补',
      '他人评价介入时是否被带偏',
      '冲突后是否愿意回到沟通',
      '是否主动寻求支持',
      '是否把情绪转成具体行动',
      '失败后是否恢复生活节奏',
      '是否能接受不完美回应',
    ],
    friendship_pressure: [
      '他人评价介入时是否被带偏',
      '信息不足时是追问还是脑补',
      '是否区分朋友意见和自身判断',
      '关系对象不配合时是否表达边界',
      '时间压力下是否能排序优先级',
      '是否主动寻求支持',
      '是否把情绪转成具体行动',
      '是否能接受不完美方案',
    ],
    workplace_conflict: [
      '公开质疑下是否先澄清事实',
      '外部计划被打断后的即时反应',
      '责任不清时是否表达边界',
      '他人评价介入时是否被带偏',
      '时间压力下是否能排序优先级',
      '资源缺失时是替代方案还是停滞',
      '失败后是否恢复工作节奏',
      '是否把情绪转成具体行动',
    ],
    family: [
      '责任请求出现时是否表达边界',
      '资源缺失时是替代方案还是停滞',
      '他人情绪介入时是否被带偏',
      '时间压力下是否能排序优先级',
      '是否主动寻求支持',
      '是否把情绪转成具体行动',
      '失败后是否恢复生活节奏',
      '是否能接受不完美方案',
    ],
    uncertainty: [
      '信息不足时是追问还是脑补',
      '外部计划被打断后的即时反应',
      '资源缺失时是替代方案还是停滞',
      '他人评价介入时是否被带偏',
      '时间压力下是否能排序优先级',
      '失败后是否恢复生活节奏',
      '是否主动寻求支持',
      '是否把情绪转成具体行动',
    ],
    repair: [
      '关系对象不配合时是否表达边界',
      '信息不足时是追问还是脑补',
      '是否主动发起修复',
      '他人评价介入时是否被带偏',
      '失败后是否恢复生活节奏',
      '是否把情绪转成具体行动',
      '是否主动寻求支持',
      '是否能接受不完美回应',
    ],
    decision: [
      '信息不足时是追问还是脑补',
      '资源缺失时是替代方案还是停滞',
      '时间压力下是否能排序优先级',
      '他人评价介入时是否被带偏',
      '外部计划被打断后的即时反应',
      '是否主动寻求支持',
      '是否把情绪转成具体行动',
      '是否能接受不完美方案',
    ],
  };
  return dimensions[sceneType];
}

function buildFallbackEventPlans(sceneType: SceneType): QuestionFocus['eventPlans'] {
  const basePlans: Record<SceneType, NonNullable<QuestionFocus['eventPlans']>> = {
    relationship: [
      {
        title: '咖啡馆没接话',
        scene: '晨桥咖啡馆角桌，我和关系对象坐在一起，林遥在柜台旁边能看见。',
        trigger: '我把手机里那条让我不舒服的群聊玩笑递给对方看，对方只扫了一眼就继续回消息，没有回答我问的“你也这样觉得吗”。',
        participants: ['我', '关键对象', '林遥'],
        informationGoal: '看我会不会直接说出不安，还是转头找旁人确认。',
        judgmentSignal: '能平静说清需求偏修复；冷掉或立刻离开偏回避。',
      },
      {
        title: '旁人插了一句',
        scene: '咖啡馆排队处，林遥听到两个人气氛紧张。',
        trigger: '林遥把刚打印的小票放到桌边，提醒我和对方先确认刚才那句玩笑到底是谁先说的、是不是当着别人说的。',
        participants: ['我', '关键对象', '林遥'],
        informationGoal: '看我会不会被旁人带偏，还是回到和对方的真实互动。',
        judgmentSignal: '能回到事实偏稳定；顺着旁人评价升级情绪偏易受影响。',
      },
      {
        title: '一起处理小事',
        scene: '咖啡馆门口，有人需要两人一起挪开挡路的箱子。',
        trigger: '门口两箱玻璃杯挡住通道，林遥请我扶住左边箱子、对方搬右边箱子，必须配合才能让后面的人通过。',
        participants: ['我', '关键对象'],
        informationGoal: '看压力降下来后，我是否还愿意自然协作。',
        judgmentSignal: '愿意协作和补一句解释偏修复；只做完就走偏疏离。',
      },
    ],
    friendship_pressure: [
      {
        title: '朋友当场劝我',
        scene: '咖啡馆角桌，我、朋友和关系对象先后在附近。',
        trigger: '朋友听见对方又低头看手机没回答，直接把半杯咖啡推到我面前说“你别再替他找理由了”。',
        participants: ['我', '朋友', '关键对象'],
        informationGoal: '看我会不会马上采纳朋友意见。',
        judgmentSignal: '先核实对方想法偏独立；立刻站朋友一边偏受影响。',
      },
      {
        title: '对方路过听见',
        scene: '咖啡馆门口，关系对象刚好听见朋友的评价。',
        trigger: '对方走到门口时听见朋友说“这不是第一次了”，立刻停下来问我是不是已经把整件事讲给别人评判。',
        participants: ['我', '朋友', '关键对象'],
        informationGoal: '看我会不会解释边界，还是让误会扩大。',
        judgmentSignal: '能解释事实偏修复；沉默或反击偏升级。',
      },
      {
        title: '三个人必须同桌',
        scene: '咖啡馆突然满座，三个人只能暂时坐到同一张桌。',
        trigger: '咖啡馆只剩一张四人桌，朋友坐在我左边，对方站在右侧等我挪包，双方都看着我先回应谁。',
        participants: ['我', '朋友', '关键对象'],
        informationGoal: '看我如何分配注意力和立场。',
        judgmentSignal: '能分别回应两边偏稳定；只讨好一边偏摇摆。',
      },
    ],
    workplace_conflict: [
      {
        title: '办公室被质疑',
        scene: '社区办公室公告栏前，我和工作对象在整理资料。',
        trigger: '我把排班表贴到公告栏时，关键对象指着缺失的周三备注说“这项你昨天没交代清楚”，旁边两个人都停下来看我。',
        participants: ['我', '关键对象', '陈桥'],
        informationGoal: '看我先澄清事实还是先顾面子。',
        judgmentSignal: '先列事实偏解决问题；急着反击偏防御。',
      },
      {
        title: '同事补了一句',
        scene: '办公室门口，旁边居民听到争论。',
        trigger: '宁素拿着会议记录走到门口，指出上周版本里也没有这条备注，提醒大家不要只把责任推到我身上。',
        participants: ['我', '关键对象', '宁素'],
        informationGoal: '看我是否接受第三方缓和。',
        judgmentSignal: '能顺势降温偏协作；继续争输赢偏对抗。',
      },
      {
        title: '私下解释机会',
        scene: '办公室走廊，我和对方短暂独处。',
        trigger: '办公室走廊只剩我和关键对象，对方把那张漏备注的排班表递回来，问我为什么早上发现时没有先提醒。',
        participants: ['我', '关键对象'],
        informationGoal: '看我能不能在低压场景里补充解释。',
        judgmentSignal: '能承认遗漏偏修复；继续推责偏关系受损。',
      },
    ],
    family: [],
    uncertainty: [],
    repair: [],
    decision: [],
  };
  const defaultPlans = basePlans.relationship;
  const dimensions = analysisDimensionsForScene(sceneType);
  const selectedPlans = basePlans[sceneType].length > 0 ? basePlans[sceneType] : defaultPlans;
  return selectedPlans.map((plan, index) => ({
    ...plan,
    observationAxis: plan.observationAxis ?? dimensions[index % dimensions.length],
  }));
}

function resident(
  key: string,
  name: string,
  role: string,
  mbtiCode: string,
  defaultLocationKey: string,
  traits: string[],
  background: string,
): TownResidentSeed {
  return {
    key,
    name,
    role,
    mbtiCode,
    weights: weightsFromCode(mbtiCode),
    traits,
    background,
    defaultLocationKey,
    scheduleTags: scheduleForLocation(defaultLocationKey),
  };
}

function memory(
  kind: TownMemorySeed['kind'],
  salience: number,
  title: string,
  summary: string,
  residentKeys: string[],
  locationKey?: string,
): TownMemorySeed {
  return { kind, salience, title, summary, residentKeys, locationKey };
}

function weightsFromCode(code: string): MbtiWeights {
  const upper = code.toUpperCase();
  return {
    e: upper.includes('E') ? 72 : 28,
    i: upper.includes('I') ? 72 : 28,
    s: upper.includes('S') ? 68 : 32,
    n: upper.includes('N') ? 68 : 32,
    t: upper.includes('T') ? 70 : 30,
    f: upper.includes('F') ? 70 : 30,
    j: upper.includes('J') ? 70 : 30,
    p: upper.includes('P') ? 70 : 30,
  };
}

function scheduleForLocation(locationKey: string): string[] {
  const common = ['weekday', 'weekend'];
  if (locationKey === 'cafe' || locationKey === 'square') {
    return [...common, 'morning', 'evening'];
  }
  if (locationKey === 'clinic' || locationKey === 'office' || locationKey === 'school') {
    return [...common, 'daytime'];
  }
  return [...common, 'afternoon', 'evening'];
}

function buildRelationships(): TownRelationshipSeed[] {
  const explicit: TownRelationshipSeed[] = [
    relation('lin_yao', 'xia_yue', 82, 76, 80, 22, 68, '林遥常提醒夏越先听完朋友的需求再给建议。'),
    relation('zhou_mian', 'su_ning', 78, 84, 72, 12, 62, '周眠陪苏宁处理过家庭急事。'),
    relation('xu_an', 'mei_zhi', 74, 81, 66, 10, 54, '许岸修好过梅枝的门锁，梅枝信他的行动判断。'),
    relation('chen_qiao', 'wen_li', 70, 60, 45, 58, 72, '两人都重秩序，但陈桥更愿意临场调整。'),
    relation('he_yu', 'luo_qing', 64, 72, 70, 18, 58, '何雨会向罗晴请教如何区分照顾和过度承担。'),
    relation('tang_xi', 'pei_xun', 69, 70, 76, 20, 52, '两人常在河边慢慢谈关系里的含义。'),
    relation('gao_sheng', 'song_chi', 86, 66, 78, 34, 61, '两人能快速带动公共气氛，也容易变吵。'),
    relation('qiao_nan', 'song_chi', 58, 38, 42, 72, 55, '乔南曾公开质疑宋迟不靠谱。'),
    relation('yan_ke', 'bai_mu', 62, 72, 50, 20, 60, '两人都倾向先找证据再下结论。'),
    relation('liang_ce', 'zhao_heng', 55, 44, 34, 76, 63, '梁策不接受赵衡只讲结果不讲证据。'),
  ];
  const generated: TownRelationshipSeed[] = [];
  let index = 0;
  for (let aIndex = 0; aIndex < defaultTownResidents.length; aIndex++) {
    for (let bIndex = aIndex + 1; bIndex < defaultTownResidents.length; bIndex++) {
      if (generated.length + explicit.length >= 72) {
        return [...explicit, ...generated];
      }
      const a = defaultTownResidents[aIndex];
      const b = defaultTownResidents[bIndex];
      if (hasRelation(explicit, a.key, b.key) || hasRelation(generated, a.key, b.key)) {
        continue;
      }
      const sameLocation = a.defaultLocationKey === b.defaultLocationKey;
      const familiarity = sameLocation ? 66 : 38 + ((index * 11) % 34);
      const tension = 12 + ((index * 17) % 55);
      generated.push(
        relation(
          a.key,
          b.key,
          familiarity,
          42 + ((index * 13) % 41),
          40 + ((index * 19) % 43),
          tension,
          35 + ((index * 23) % 45),
          sameLocation
            ? `${a.name}和${b.name}常在${locationName(a.defaultLocationKey)}碰面，彼此熟悉但不一定亲近。`
            : `${a.name}和${b.name}通过小镇事务有过几次交集。`,
        ),
      );
      index++;
    }
  }
  const relationships = [...explicit, ...generated];
  if (relationships.length < 72) {
    throw new Error(`Expected at least 72 town relationships, got ${relationships.length}`);
  }
  return relationships;
}

function relation(
  residentAKey: string,
  residentBKey: string,
  familiarity: number,
  trust: number,
  warmth: number,
  tension: number,
  influence: number,
  summary: string,
): TownRelationshipSeed {
  return { residentAKey, residentBKey, familiarity, trust, warmth, tension, influence, summary };
}

function hasRelation(relations: TownRelationshipSeed[], a: string, b: string): boolean {
  return relations.some(
    (relation) =>
      (relation.residentAKey === a && relation.residentBKey === b) ||
      (relation.residentAKey === b && relation.residentBKey === a),
  );
}

function chooseLocation(sceneType: SceneType, locations: TownLocationSeed[]): TownLocationSeed {
  return (
    locations.find((location) => location.affordances.includes(sceneType)) ??
    locations.find((location) => location.key === 'cafe') ??
    locations[0]
  );
}

function scoreResident(
  resident: TownResidentSeed,
  sceneType: SceneType,
  locationKey: string,
  input: SceneSelectionInput,
): number {
  let score = resident.defaultLocationKey === locationKey ? 30 : 0;
  const roleText = `${resident.role} ${resident.traits.join(' ')} ${resident.background}`;
  if (sceneType === 'workplace_conflict' && hasAny(roleText, ['经理', '组织者', '会计', '律师', '主管', '物流'])) score += 28;
  if (sceneType === 'friendship_pressure' && hasAny(roleText, ['朋友', '保护', '调停', '热心', '社工', '咖啡'])) score += 25;
  if (sceneType === 'relationship' && hasAny(roleText, ['倾听', '关系', '温柔', '插画', '咨询'])) score += 24;
  if (sceneType === 'uncertainty' && (resident.weights.n > 60 || resident.weights.t > 60)) score += 22;
  if (sceneType === 'repair' && (resident.weights.f > 60 || hasAny(roleText, ['调停', '和解', '安抚']))) score += 28;
  if (sceneType === 'decision' && (resident.weights.j > 60 || resident.weights.t > 60)) score += 22;
  if (sceneType === 'family' && hasAny(roleText, ['护士', '医生', '社工', '照顾', '家庭'])) score += 24;
  score += memoryScore(resident.key, sceneType, input.memories);
  score += relationshipCentrality(resident.key, input.relationships);
  return score;
}

function memoryScore(residentKey: string, sceneType: SceneType, memories: TownMemorySeed[]): number {
  return memories.reduce((total, memoryItem) => {
    if (!memoryItem.residentKeys.includes(residentKey)) {
      return total;
    }
    if (sceneType === 'repair' && memoryItem.kind === 'favor') return total + 10;
    if (sceneType === 'friendship_pressure' && memoryItem.kind === 'conflict') return total + 9;
    if (sceneType === 'uncertainty' && memoryItem.kind === 'rumor') return total + 8;
    return total + Math.min(6, Math.round(memoryItem.salience / 20));
  }, 0);
}

function relationshipCentrality(residentKey: string, relationships: TownRelationshipSeed[]): number {
  const related = relationships.filter(
    (relationItem) =>
      relationItem.residentAKey === residentKey || relationItem.residentBKey === residentKey,
  );
  return Math.min(14, related.length * 2);
}

function locationName(key: string): string {
  return defaultTownLocations.find((location) => location.key === key)?.name ?? key;
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word));
}
