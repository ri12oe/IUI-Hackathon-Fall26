import type { ConfusionAlert } from "../hooks/useThresholdAlert";
import "./ConfusionAlertBanner.scss";

type Props = {
  alert: ConfusionAlert;
  currentSlide: number;
  onGoTo: (slide: number) => void;
  onDismiss: () => void;
};

export default function ConfusionAlertBanner({ alert, currentSlide, onGoTo, onDismiss }: Props) {
  return (
    <div className="toast" role="alert">
      <span className="toast__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
      </span>
      <span className="toast__text">
        <strong>{alert.percent}% lost on slide {alert.slide}</strong>
        <small>{alert.lost} of {alert.active} students</small>
      </span>
      {currentSlide !== alert.slide && (
        <button className="btn btn--secondary" onClick={() => onGoTo(alert.slide)}>
          Back to slide {alert.slide}
        </button>
      )}
      <button className="toast__dismiss" onClick={onDismiss}>Dismiss</button>
    </div>
  );
}