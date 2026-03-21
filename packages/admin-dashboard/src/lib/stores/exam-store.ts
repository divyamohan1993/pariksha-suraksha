import { create } from "zustand";
import type {
  Exam,
  ExamBlueprint,
  MonitorData,
  AlertItem,
  Center,
} from "../api";

interface ExamState {
  currentExam: Exam | null;
  exams: Exam[];
  centers: Center[];
  monitorData: MonitorData | null;
  alerts: AlertItem[];
  setCurrentExam: (exam: Exam | null) => void;
  setExams: (exams: Exam[]) => void;
  setCenters: (centers: Center[]) => void;
  updateBlueprint: (blueprint: ExamBlueprint) => void;
  setMonitorData: (data: MonitorData) => void;
  addAlert: (alert: AlertItem) => void;
  acknowledgeAlert: (alertId: string) => void;
  clearAlerts: () => void;
}

export const useExamStore = create<ExamState>()((set, get) => ({
  currentExam: null,
  exams: [],
  centers: [],
  monitorData: null,
  alerts: [],

  setCurrentExam: (exam) => set({ currentExam: exam }),
  setExams: (exams) => set({ exams }),
  setCenters: (centers) => set({ centers }),

  updateBlueprint: (blueprint) => {
    const { currentExam } = get();
    if (currentExam) {
      set({
        currentExam: { ...currentExam, blueprint, status: "blueprint_set" },
      });
    }
  },

  setMonitorData: (data) => set({ monitorData: data }),

  addAlert: (alert) =>
    set((state) => ({ alerts: [alert, ...state.alerts].slice(0, 100) })),

  acknowledgeAlert: (alertId) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === alertId ? { ...a, acknowledged: true } : a
      ),
    })),

  clearAlerts: () => set({ alerts: [] }),
}));
