export const PERSONAL_MEASUREMENTS = {
  height: ["身高", "赤脚站直，从头顶量到脚底。"],
  shoulderWidth: ["肩宽", "测量左右肩骨点之间的距离。"],
  chest: ["胸围", "软尺水平绕胸部最丰满处一整圈。"],
  waist: ["腰围", "自然站立，软尺绕自然腰线一整圈。"],
  hips: ["臀围", "软尺水平绕臀部最丰满处一整圈。"],
  thigh: ["大腿围", "软尺绕大腿最丰满处一整圈。"],
  knee: ["膝围", "自然站立，软尺绕膝盖中部一整圈，不要勒紧。"],
  armLength: ["臂长", "手臂自然放松，从肩骨点量到腕骨。"],
  inseam: ["内腿长", "从裆部沿腿内侧量到脚底。"],
  outseam: ["外腿长", "从自然腰线沿腿外侧量到脚底。"],
  footLength: ["脚长", "赤脚站立，从脚跟量到最长脚趾；两脚不同时参考较长的一只。"],
} as const;
export type PersonalMeasurement = keyof typeof PERSONAL_MEASUREMENTS;
