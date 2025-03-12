import { IconColor } from '@/components/icons/index';
import { TbDroplet } from 'react-icons/tb';

const FaucetIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <TbDroplet size={size} color={color} {...props} />;
};

export { FaucetIcon };
