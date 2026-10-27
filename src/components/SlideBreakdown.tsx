import type { SlideConfusion } from "../lib/confusion";
import "./SlideBreakdown.scss";

type Props = {
  items: SlideConfusion[];
  currentSlide: number;
  onSelect: (slide: number) => void;
  limit?: number;
};

export default function SlideBreakdown({ items, currentSlide, onSelect, limit = 5 }: Props) {
  if (items.length === 0) {
    return (
      <section className="breakdown">
        <h2 className="breakdown__title">Confusing slides</h2>
        <p className="breakdown__empty">No lost taps yet.</p>
      </section>
    );
  }

  const top = items.slice(0, limit);
  const max = top[0].lost;

  return (
    <section className="breakdown">
      <h2 className="breakdown__title">Confusing slides</h2>
      <ol className="breakdown__list">
        {top.map(({ slide, lost }) => (
          <li key={slide}>
            <button
              className={`breakdown__row ${slide === currentSlide ? "is-current" : ""}`}
              onClick={() => onSelect(slide)}
              title={`Go to slide ${slide}`}
            >
              <span className="breakdown__slide">Slide {slide}</span>
              <span className="breakdown__bar">
                <span style={{ width: `${(lost / max) * 100}%` }} />
              </span>
              <span className="breakdown__count">{lost}</span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}