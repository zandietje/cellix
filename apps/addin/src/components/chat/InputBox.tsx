import { useState, KeyboardEvent } from 'react';
import { makeStyles, Input, Button, tokens } from '@fluentui/react-components';
import { Send24Regular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'center',
  },
  input: {
    flex: 1,
  },
});

interface InputBoxProps {
  onSend: (content: string) => void;
  disabled?: boolean;
}

export function InputBox({ onSend, disabled }: InputBoxProps) {
  const styles = useStyles();
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (trimmed && !disabled) {
      onSend(trimmed);
      setValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.container}>
      <Input
        className={styles.input}
        placeholder="Ask about your ecommerce data..."
        value={value}
        onChange={(_, data) => setValue(data.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Button
        appearance="primary"
        icon={<Send24Regular />}
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        aria-label="Send message"
      />
    </div>
  );
}
