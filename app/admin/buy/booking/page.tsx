import BookingClient from './BookingClient';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function BookingPage({ searchParams }: PageProps) {
  // Extract optional pre-filled values from searchParams (async in Next.js 15)
  const params = await searchParams;
  const date = typeof params?.date === 'string' ? params.date : undefined;
  const name = typeof params?.name === 'string' ? params.name : undefined;

  return <BookingClient initialDate={date} initialName={name} />;
}
