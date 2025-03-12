import { IconColor } from '@/components/icons/index';
import { LuMoon } from 'react-icons/lu';

const NightModeIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <LuMoon size={size} color={color} {...props} />;
};

export { NightModeIcon };
