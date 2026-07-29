export type CanvasCourse = {
  id: number;
  name: string;
  course_code?: string;
  syllabus_body?: string;
  enrollments?: Array<{
    computed_current_score?: number;
    computed_current_grade?: string;
    computed_final_score?: number;
    computed_final_grade?: string;
  }>;
};

export type CanvasAssignment = {
  id: number;
  name: string;
  due_at: string | null;
  points_possible: number | null;
  html_url?: string;
};

export type CanvasCalendarEvent = {
  id: number;
  title: string;
  start_at: string;
  end_at?: string;
  location_name?: string;
  context_code?: string;
};

export class CanvasClient {
  constructor(
    private baseUrl: string,
    private token: string,
  ) {}

  private async fetch<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Canvas API error ${res.status}: ${body.slice(0, 200)}`);
    }

    return res.json() as Promise<T>;
  }

  private async fetchPaginated<T>(path: string, params?: Record<string, string>): Promise<T[]> {
    const results: T[] = [];
    let page = 1;

    while (true) {
      const pageParams = { ...params, page: String(page), per_page: "100" };
      const url = new URL(`${this.baseUrl.replace(/\/$/, "")}/api/v1${path}`);
      for (const [key, value] of Object.entries(pageParams)) {
        url.searchParams.set(key, value);
      }

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}` },
        cache: "no-store",
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Canvas API error ${res.status}: ${body.slice(0, 200)}`);
      }

      const batch = (await res.json()) as T[];
      results.push(...batch);

      const link = res.headers.get("link");
      if (!link?.includes('rel="next"')) break;
      page += 1;
      if (page > 20) break;
    }

    return results;
  }

  async testConnection(): Promise<boolean> {
    await this.fetch<{ id: number }>("/users/self");
    return true;
  }

  async listCourses(includeScores = false): Promise<CanvasCourse[]> {
    const params: Record<string, string> = {
      enrollment_state: "active",
    };
    if (includeScores) {
      params["include[]"] = "syllabus_body";
    } else {
      params["include[]"] = "syllabus_body";
    }
    return this.fetchPaginated<CanvasCourse>("/courses", params);
  }

  async getCourse(courseId: number): Promise<CanvasCourse> {
    return this.fetch<CanvasCourse>(`/courses/${courseId}`, {
      "include[]": "syllabus_body",
    });
  }

  async listAssignments(courseId: number): Promise<CanvasAssignment[]> {
    return this.fetchPaginated<CanvasAssignment>(
      `/courses/${courseId}/assignments`,
    );
  }

  async listCalendarEvents(): Promise<CanvasCalendarEvent[]> {
    return this.fetchPaginated<CanvasCalendarEvent>("/calendar_events", {
      type: "event",
      all_events: "true",
    });
  }

  async listCoursesWithScores(): Promise<CanvasCourse[]> {
    return this.fetchPaginated<CanvasCourse>("/courses", {
      enrollment_state: "active",
      "include[]": "total_scores",
    });
  }
}
