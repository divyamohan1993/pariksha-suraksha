/**
 * Exam center and seating types for the ParikshaSuraksha exam integrity system.
 */

export enum CenterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  UNDER_REVIEW = 'UNDER_REVIEW',
}

/**
 * A single seat within an exam center.
 */
export interface Seat {
  readonly seatNum: number;
  readonly row: number;
  readonly column: number;
  readonly candidateId?: string;
  readonly terminalId?: string;
  readonly status: 'available' | 'assigned' | 'occupied' | 'disconnected';
}

/**
 * An exam center where candidates take the exam.
 */
export interface ExamCenter {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly address: string;
  readonly city: string;
  readonly state: string;
  readonly pincode: string;
  readonly totalSeats: number;
  readonly rows: number;
  readonly columns: number;
  readonly seats: ReadonlyArray<Seat>;
  readonly status: CenterStatus;
  readonly invigilatorIds: ReadonlyArray<string>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Real-time center status during an active exam.
 */
export interface CenterExamStatus {
  readonly centerId: string;
  readonly examId: string;
  readonly candidatesPresent: number;
  readonly candidatesStarted: number;
  readonly candidatesSubmitted: number;
  readonly candidatesDisconnected: number;
  readonly decryptionComplete: boolean;
  readonly lastHeartbeat: string;
}
