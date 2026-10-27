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
    <div className="alert" role="alert">
      <div className="alert__text">
        <strong>
          {alert.percent}% of students are lost on slide {alert.slide}
        </strong>
        <span>
          {alert.lost} of {alert.active} students
        </span>
      </div>

      <div className="alert__actions">
        {currentSlide !== alert.slide && (
          <button className="alert__primary" onClick={() => onGoTo(alert.slide)}>
            Back to slide {alert.slide}
          </button>
        )}
        <button className="alert__dismiss" onClick={onDismiss} aria-label="Dismiss alert">
          Dismiss
        </button>
      </div>
    </div>
  );
}