import { useParams } from "react-router";

export default function Report() {
  const { code } = useParams();
  return <h1>Report for room {code}</h1>;
}