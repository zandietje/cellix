import { Spinner, makeStyles, Text, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalM,
  },
});

interface LoadingProps {
  message?: string;
}

export function Loading({ message = 'Loading...' }: LoadingProps) {
  const styles = useStyles();

  return (
    <div className={styles.container}>
      <Spinner size="medium" />
      <Text>{message}</Text>
    </div>
  );
}
