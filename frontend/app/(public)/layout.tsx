// File: frontend/app/(public)/layout.tsx
import Header from "./_components/Header";
import Footer from "./_components/Footer";
import SmoothScroll from "./_components/SmoothScroll";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <SmoothScroll />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
