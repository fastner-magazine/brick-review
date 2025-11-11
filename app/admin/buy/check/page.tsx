import CheckClient from './CheckClient';

type PageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function BuyCheckPage({ searchParams }: PageProps) {
  // Extract filter from searchParams (with default 'pending', async in Next.js 15)
  const params = await searchParams;
  const filter = typeof params?.filter === 'string'
    ? (params.filter as 'pending' | 'completed' | 'on_hold')
    : 'pending';

  return <CheckClient initialFilter={filter} />;
}
