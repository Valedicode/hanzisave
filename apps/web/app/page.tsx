import Link from "next/link";
import { AccessCodeForm } from "./access-code-form";
import { NavMenu } from "./nav-menu";
import styles from "./landing.module.css";

const HSK_LEGEND = [
  { label: "HSK 1", color: "var(--h1)" },
  { label: "HSK 2", color: "var(--h2)" },
  { label: "HSK 3", color: "var(--h3)" },
  { label: "HSK 4", color: "var(--h4)" },
  { label: "HSK 5", color: "var(--h5)" },
  { label: "HSK 6", color: "var(--h6)" },
  { label: "Unknown", color: "var(--oov)" },
];

const STEPS = [
  {
    title: "Read anything",
    text: "Paste an article, a chat or a textbook page, or take a photo of a printed page. Chinese text is read straight from the picture.",
  },
  {
    title: "See what is new",
    text: "Every word is colored by HSK level. Words you already have in Anki are left out, so you only see what you have not met yet.",
  },
  {
    title: "Save the cards",
    text: "One tap makes a card with pinyin, Jyutping, patterns and an example sentence, in your own format, ready to import into Anki.",
  },
];

const NEXT_UP = ["Grammar points", "Review inside the app", "Install on your phone"];

export default function Landing() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          <span className={styles.logo}>汉</span>
          <span className={styles.brandName}>HanziSave</span>
        </Link>
        <NavMenu />
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.tiles} aria-hidden="true">
            <span className={`${styles.tile} ${styles.t1}`}>你</span>
            <span className={`${styles.tile} ${styles.t2}`}>读</span>
            <span className={`${styles.tile} ${styles.t3}`}>趋</span>
            <span className={`${styles.tile} ${styles.t4}`}>的</span>
            <span className={`${styles.tile} ${styles.t5}`}>势</span>
          </div>

          <h1 className={styles.title}>Turn anything you read into flashcards at your level</h1>
          <p className={styles.lead}>
            Paste an article or photograph a page. HanziSave grades every word on the HSK 1–6 scale, finds the ones you
            do not know yet, and turns them into cards for your Anki deck.
          </p>

          <ul className={styles.legend} aria-label="HSK level colors">
            {HSK_LEGEND.map((h) => (
              <li key={h.label} className={styles.pill}>
                <span className={styles.dot} style={{ background: h.color }} />
                {h.label}
              </li>
            ))}
          </ul>

          <div className={styles.actions}>
            <Link href="/scan" className={styles.primary}>
              Scan new words
            </Link>
            <Link href="/import" className={styles.link}>
              Import your Anki deck
            </Link>
          </div>
        </section>

        <AccessCodeForm />

        <section className={styles.section} aria-labelledby="how">
          <h2 id="how" className={styles.sectionTitle}>
            How it works
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title} className={styles.step}>
                <span className={styles.number}>{i + 1}</span>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepText}>{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <p className={styles.soon}>
          <span>Coming next</span>
          {NEXT_UP.map((item) => (
            <span key={item} className={styles.chip}>
              {item}
            </span>
          ))}
        </p>
      </main>

      <footer className={styles.footer}>HanziSave · made for reading Chinese</footer>
    </div>
  );
}
