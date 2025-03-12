type MarkerProps = {
  text?: string;
  className?: string;
};

const Marker = ({ text, className }: MarkerProps) => {
  return (
    <div
      className={`flex items-center justify-center px-[12px] py-[4px] border-[1px] rounded-[4px] border-[#E22901] bg-[#732416] ${className}`}
    >
      {text}
    </div>
  );
};

export default Marker;
