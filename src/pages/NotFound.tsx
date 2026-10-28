import { Link } from "react-router";
import Logo from "../components/Logo";

export default function NotFound() {
  return (
    <main className="host">
      <Logo size={32} />
      <p>That page doesn't exist.</p>
      <Link to="/join">Join a session</Link>
    </main>
  );
}