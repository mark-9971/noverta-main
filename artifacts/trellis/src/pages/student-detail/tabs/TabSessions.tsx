import StudentSessionHistory from "../StudentSessionHistory";

interface Props {
  dataSessions: any[];
  dataLoading: boolean;
  expandedDataSessionId: number | null;
  expandedDataDetail: any;
  expandedDataLoading: boolean;
  toggleDataSession: (id: number) => Promise<void>;
  recentSessions: any[];
  expandedServiceSessionId: number | null;
  expandedServiceDetail: any;
  expandedServiceLoading: boolean;
  toggleServiceSession: (id: number) => Promise<void>;
  formatDate: (d: string) => string;
  formatTime: (t: string | null) => string | null;
}

export default function TabSessions(props: Props) {
  return (
    <div className="space-y-5">
      <StudentSessionHistory section="data" {...props} />
      <StudentSessionHistory section="service" {...props} />
    </div>
  );
}
