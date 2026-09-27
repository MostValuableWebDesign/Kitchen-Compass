import { forwardRef } from 'react';
import { Platform, ScrollView, ScrollViewProps } from 'react-native';
import {
  KeyboardAwareScrollView,
  KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

type Props = KeyboardAwareScrollViewProps & ScrollViewProps;

export const KeyboardAwareScrollViewCompat = forwardRef<ScrollView, Props>(
  function KeyboardAwareScrollViewCompat({
    children,
    keyboardShouldPersistTaps = 'handled',
    ...props
  }, ref) {
    if (Platform.OS === 'web') {
      return (
        <ScrollView
          ref={ref}
          keyboardShouldPersistTaps={keyboardShouldPersistTaps}
          {...props}
        >
          {children}
        </ScrollView>
      );
    }
    return (
      <KeyboardAwareScrollView
        ref={(instance) => {
          const scrollView = instance as unknown as ScrollView;
          if (typeof ref === 'function') ref(scrollView);
          else if (ref) ref.current = scrollView;
        }}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </KeyboardAwareScrollView>
    );
  },
);
