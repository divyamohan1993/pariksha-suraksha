import { create } from "zustand";
import type { QuestionTemplate } from "../api";

interface QuestionState {
  selectedTemplate: QuestionTemplate | null;
  generatedTemplate: QuestionTemplate | null;
  filters: {
    subject: string;
    topic: string;
    bloomLevel: string;
    calibrationStatus: string;
    search: string;
  };
  page: number;
  setSelectedTemplate: (template: QuestionTemplate | null) => void;
  setGeneratedTemplate: (template: QuestionTemplate | null) => void;
  setFilters: (filters: Partial<QuestionState["filters"]>) => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
}

const defaultFilters = {
  subject: "",
  topic: "",
  bloomLevel: "",
  calibrationStatus: "",
  search: "",
};

export const useQuestionStore = create<QuestionState>()((set) => ({
  selectedTemplate: null,
  generatedTemplate: null,
  filters: { ...defaultFilters },
  page: 1,

  setSelectedTemplate: (template) => set({ selectedTemplate: template }),
  setGeneratedTemplate: (template) => set({ generatedTemplate: template }),
  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
      page: 1,
    })),
  setPage: (page) => set({ page }),
  resetFilters: () => set({ filters: { ...defaultFilters }, page: 1 }),
}));
