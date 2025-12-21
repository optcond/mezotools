import { Link } from "react-router-dom";
import { ArrowLeft, Users, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Contacts = () => {
  const contacts = [
    {
      name: "Protocol Support",
      role: "Technical Assistance",
      email: "support@musd.protocol",
      phone: "+1 (555) 123-4567",
    },
    {
      name: "Risk Team",
      role: "Risk Management",
      email: "risk@musd.protocol",
      phone: "+1 (555) 234-5678",
    },
    {
      name: "Operations",
      role: "General Inquiries",
      email: "ops@musd.protocol",
      phone: "+1 (555) 345-6789",
    },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full glass-card border-b border-card-border/60">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="h-5 w-5" />
                <span className="sr-only">Back to Dashboard</span>
              </Button>
            </Link>
            <h1 className="text-xl font-bold uppercase tracking-wider">Contacts</h1>
          </div>
        </div>
      </header>

      <main className="max-w-[1280px] mx-auto px-4 py-6 sm:px-6">
        <Card className="glass-card p-5 sm:p-6 md:p-8">
          <div className="mb-6 flex items-center gap-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">Contact Information</h2>
              <p className="text-muted-foreground">Get in touch with our team</p>
            </div>
          </div>

          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <Card key={index} className="glass-card transition-colors hover:border-primary/40">
                <div className="flex flex-col gap-3 p-5 sm:p-6">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">{contact.name}</h3>
                    <p className="text-sm text-muted-foreground">{contact.role}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-primary" />
                      <a href={`mailto:${contact.email}`} className="hover:text-primary transition-colors">
                        {contact.email}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-primary" />
                      <a href={`tel:${contact.phone}`} className="hover:text-primary transition-colors">
                        {contact.phone}
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
};

export default Contacts;
