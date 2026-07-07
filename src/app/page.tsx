import Link from "next/link";

export default function Home() {
  return (
    <main className="shell">
      <section className="hero">
        <div>
          <h1>IELTS Speaking Homework Platform</h1>
          <p>
            Create speaking assignments, share a student link, receive recordings, generate AI draft feedback, and publish
            final teacher feedback.
          </p>
        </div>
        <aside className="panel stack">
          <Link className="btn" href="/teacher">
            Open teacher dashboard
          </Link>
          <p className="hint">Students enter through assignment links created in the teacher dashboard.</p>
        </aside>
      </section>
    </main>
  );
}
