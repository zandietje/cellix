import { makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    width: 'fit-content',
  },
  dot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: tokens.colorNeutralForeground3,
    animationName: {
      '0%, 60%, 100%': {
        transform: 'translateY(0)',
        opacity: 0.4,
      },
      '30%': {
        transform: 'translateY(-4px)',
        opacity: 1,
      },
    },
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  dot1: {
    animationDelay: '0s',
  },
  dot2: {
    animationDelay: '0.2s',
  },
  dot3: {
    animationDelay: '0.4s',
  },
});

export function TypingIndicator() {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <div className={`${styles.dot} ${styles.dot1}`} />
      <div className={`${styles.dot} ${styles.dot2}`} />
      <div className={`${styles.dot} ${styles.dot3}`} />
    </div>
  );
}
