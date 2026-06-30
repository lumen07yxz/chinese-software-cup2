import { create } from 'zustand'
import type { ClassroomQuestion, CourseLesson } from '../services/api'

export type ClassroomMode = 'select' | 'outline' | 'class'

export type ClassroomPhase =
  | 'idle'
  | 'loading'
  | 'warmup'
  | 'lecture'
  | 'practice'
  | 'review'
  | 'feynman'
  | 'complete'

export const PHASE_ORDER: ClassroomPhase[] = ['warmup', 'lecture', 'practice', 'review', 'feynman']
export const PHASE_LABELS: Record<string, string> = {
  warmup: '课堂导入',
  lecture: '核心讲解',
  practice: '随堂练习',
  review: '课堂总结',
  feynman: '费曼检验',
}

interface ClassroomState {
  // 课程选择
  mode: ClassroomMode
  courseTopic: string
  courseDescription: string
  outline: CourseLesson[]
  selectedLesson: CourseLesson | null
  selectedLessonIdx: number

  // 课堂内容
  phase: ClassroomPhase
  topic: string
  content: Record<string, string>
  questions: ClassroomQuestion[]
  practiceAnswers: Record<number, string>
  error: string
  startedAt: number

  // 费曼学习
  feynmanConcepts: string[]
  feynmanIdx: number
  feynmanResults: Record<string, number>  // concept -> understanding

  // 课程选择操作
  setMode: (mode: ClassroomMode) => void
  setCourseTopic: (topic: string) => void
  setCourseDescription: (desc: string) => void
  setOutline: (outline: CourseLesson[]) => void
  selectLesson: (lesson: CourseLesson, idx: number) => void

  // 课堂操作
  setPhase: (phase: ClassroomPhase) => void
  setTopic: (topic: string) => void
  appendContent: (phase: string, chunk: string) => void
  setQuestions: (questions: ClassroomQuestion[]) => void
  setAnswer: (index: number, answer: string) => void
  setError: (err: string) => void
  reset: () => void
  start: (topic: string) => void
  goNextLesson: () => void
  backToOutline: () => void
  startFeynmanPhase: (concepts: string[]) => void
  completeFeynmanConcept: (concept: string, understanding: number) => void
  skipFeynmanConcept: () => void
}

export const useClassroomStore = create<ClassroomState>((set, get) => ({
  // 课程选择
  mode: 'select',
  courseTopic: '',
  courseDescription: '',
  outline: [],
  selectedLesson: null,
  selectedLessonIdx: -1,

  // 课堂内容
  phase: 'idle',
  topic: '',
  content: {},
  questions: [],
  practiceAnswers: {},
  error: '',
  startedAt: 0,

  // 费曼学习
  feynmanConcepts: [],
  feynmanIdx: 0,
  feynmanResults: {},

  // 课程选择操作
  setMode: (mode) => set({ mode }),
  setCourseTopic: (courseTopic) => set({ courseTopic }),
  setCourseDescription: (courseDescription) => set({ courseDescription }),
  setOutline: (outline) => set({ outline, mode: 'outline' }),
  selectLesson: (lesson, idx) => set({
    selectedLesson: lesson,
    selectedLessonIdx: idx,
    mode: 'class',
    phase: 'loading',
    topic: lesson.title,
    content: {},
    questions: [],
    practiceAnswers: {},
    error: '',
    startedAt: Date.now(),
  }),

  // 课堂操作
  setPhase: (phase) => set({ phase }),
  setTopic: (topic) => set({ topic }),
  appendContent: (phase, chunk) =>
    set((state) => ({
      content: {
        ...state.content,
        [phase]: (state.content[phase] || '') + chunk,
      },
    })),
  setQuestions: (questions) => set({ questions }),
  setAnswer: (index, answer) =>
    set((state) => ({
      practiceAnswers: { ...state.practiceAnswers, [index]: answer },
    })),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      mode: 'select',
      courseTopic: '',
      courseDescription: '',
      outline: [],
      selectedLesson: null,
      selectedLessonIdx: -1,
      phase: 'idle',
      topic: '',
      content: {},
      questions: [],
      practiceAnswers: {},
      error: '',
      startedAt: 0,
      feynmanConcepts: [],
      feynmanIdx: 0,
      feynmanResults: {},
    }),
  start: (topic) =>
    set({
      phase: 'loading',
      topic,
      content: {},
      questions: [],
      practiceAnswers: {},
      error: '',
      startedAt: Date.now(),
    }),

  // 上完一节课后跳到下一节
  goNextLesson: () => {
    const { outline, selectedLessonIdx } = get()
    const nextIdx = selectedLessonIdx + 1
    if (nextIdx < outline.length) {
      const next = outline[nextIdx]
      set({
        selectedLesson: next,
        selectedLessonIdx: nextIdx,
        phase: 'loading',
        topic: next.title,
        content: {},
        questions: [],
        practiceAnswers: {},
        error: '',
        startedAt: Date.now(),
      })
    }
  },

  // 返回课程大纲
  backToOutline: () =>
    set({
      mode: 'outline',
      phase: 'idle',
      selectedLesson: null,
      selectedLessonIdx: -1,
      topic: '',
      content: {},
      questions: [],
      practiceAnswers: {},
      error: '',
    }),

  // 开始费曼学习阶段
  startFeynmanPhase: (concepts) =>
    set({
      phase: 'feynman',
      feynmanConcepts: concepts,
      feynmanIdx: 0,
      feynmanResults: {},
    }),

  // 完成一个概念的费曼学习
  completeFeynmanConcept: (concept, understanding) =>
    set((state) => {
      const results = { ...state.feynmanResults, [concept]: understanding }
      const nextIdx = state.feynmanIdx + 1
      // 所有概念都完成了 → 进入 complete
      if (nextIdx >= state.feynmanConcepts.length) {
        return { feynmanResults: results, feynmanIdx: nextIdx, phase: 'complete' }
      }
      return { feynmanResults: results, feynmanIdx: nextIdx }
    }),

  // 跳过当前费曼概念
  skipFeynmanConcept: () =>
    set((state) => {
      const nextIdx = state.feynmanIdx + 1
      if (nextIdx >= state.feynmanConcepts.length) {
        return { feynmanIdx: nextIdx, phase: 'complete' }
      }
      return { feynmanIdx: nextIdx }
    }),
}))
