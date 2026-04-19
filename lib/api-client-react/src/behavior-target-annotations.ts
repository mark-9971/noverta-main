import { customFetch } from "./custom-fetch";

export interface BehaviorTargetAnnotation {
  id: number;
  behaviorTargetId: number;
  annotationDate: string;
  label: string;
  createdBy: number | null;
  createdAt: string;
}

export interface ProgramTargetAnnotation {
  id: number;
  programTargetId: number;
  annotationDate: string;
  label: string;
  createdBy: number | null;
  createdAt: string;
}

export interface CreateTargetAnnotationBody {
  annotationDate: string;
  label: string;
}

export const listBehaviorTargetAnnotations = (
  targetId: number,
): Promise<BehaviorTargetAnnotation[]> =>
  customFetch<BehaviorTargetAnnotation[]>(
    `/api/behavior-targets/${targetId}/annotations`,
    { method: "GET" },
  );

export const createBehaviorTargetAnnotation = (
  targetId: number,
  body: CreateTargetAnnotationBody,
): Promise<BehaviorTargetAnnotation> =>
  customFetch<BehaviorTargetAnnotation>(
    `/api/behavior-targets/${targetId}/annotations`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const deleteBehaviorTargetAnnotation = (id: number): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(`/api/behavior-target-annotations/${id}`, { method: "DELETE" });

export const listStudentBehaviorTargetAnnotations = (
  studentId: number,
): Promise<Record<number, BehaviorTargetAnnotation[]>> =>
  customFetch<Record<number, BehaviorTargetAnnotation[]>>(
    `/api/students/${studentId}/behavior-target-annotations`,
    { method: "GET" },
  );

export const listProgramTargetAnnotations = (
  targetId: number,
): Promise<ProgramTargetAnnotation[]> =>
  customFetch<ProgramTargetAnnotation[]>(
    `/api/program-targets/${targetId}/annotations`,
    { method: "GET" },
  );

export const createProgramTargetAnnotation = (
  targetId: number,
  body: CreateTargetAnnotationBody,
): Promise<ProgramTargetAnnotation> =>
  customFetch<ProgramTargetAnnotation>(
    `/api/program-targets/${targetId}/annotations`,
    { method: "POST", body: JSON.stringify(body) },
  );

export const deleteProgramTargetAnnotation = (id: number): Promise<{ success: boolean }> =>
  customFetch<{ success: boolean }>(`/api/program-target-annotations/${id}`, { method: "DELETE" });

export const listStudentProgramTargetAnnotations = (
  studentId: number,
): Promise<Record<number, ProgramTargetAnnotation[]>> =>
  customFetch<Record<number, ProgramTargetAnnotation[]>>(
    `/api/students/${studentId}/program-target-annotations`,
    { method: "GET" },
  );
