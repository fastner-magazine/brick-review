import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const tools = [
 {
  href: '/test/toolbox/app-check',
  title: 'App Check Token Inspector',
  description: 'Generate and verify App Check tokens to ensure reCAPTCHA Enterprise integration is working.',
 },
 {
  href: '/test/toolbox/firestore-write',
  title: 'Firestore Admin Write Test',
  description: 'Attempt Firestore writes via client SDK to confirm security rules and App Check enforcement.',
 },
 {
  href: '/test/toolbox/firestore-read',
  title: 'Firestore Admin Read Test',
  description: 'Fetch privileged collections using client SDK to validate admin claims and permissions.',
 },
 {
  href: '/test/toolbox/env-check',
  title: 'Environment Variable Snapshot',
  description: 'Inspect runtime variables exposed to the browser for quick validation of deployment config.',
 },
];

export default function TestToolbox() {
 return (
  <main className="min-h-screen bg-slate-50 py-10">
   <div className="container mx-auto max-w-5xl px-4">
    <header className="mb-10 text-center">
     <h1 className="text-4xl font-bold text-slate-800">Diagnostic Toolbox</h1>
     <p className="mt-4 text-slate-600">
      Collection of diagnostic utilities that run inside the deployed environment.
      Use these to verify App Check, Firestore permissions, environment variables,
      and other production-only behaviors.
     </p>
    </header>

    <section className="grid gap-6 md:grid-cols-2">
     {tools.map((tool) => (
      <Card key={tool.href} className="border border-slate-200 shadow-sm">
       <CardHeader>
        <CardTitle>{tool.title}</CardTitle>
        <CardDescription>{tool.description}</CardDescription>
       </CardHeader>
       <CardContent>
        <Link href={tool.href}>
         <Button className="w-full" variant="outline">
          Open Tool
         </Button>
        </Link>
       </CardContent>
      </Card>
     ))}
    </section>
   </div>
  </main>
 );
}