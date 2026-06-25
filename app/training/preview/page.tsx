import AdminLayout from "@/components/layout/AdminLayout";
import TrainingViewer from "@/components/training/TrainingViewer";

const slides = [
  {
    id: 1,
    title: "Welcome to Hospitality 101",
    body: "This training introduces the core expectations for delivering a great guest experience.",
  },
  {
    id: 2,
    title: "TIPS Philosophy",
    body: "TIPS stands for Team, Integrity, Present, and Service. These are the values employees should bring into every shift.",
  },
  {
    id: 3,
    title: "Team",
    body: "Team means showing up, helping others, and winning together. There is no such thing as 'not my job.'",
  },
];

export default function TrainingPreviewPage() {
  return (
    <AdminLayout
      title="Training Preview"
      description="Preview what employees will see before publishing."
    >
      <TrainingViewer title="Hospitality 101" slides={slides} />
    </AdminLayout>
  );
}