import { useParams } from "react-router-dom";
import LinenInstance from "@/components/linen/LinenInstance";

export default function InstancePage() {
  const { uuid = "" } = useParams<{ uuid: string }>();
  return <LinenInstance key={uuid} uuid={uuid} />;
}
