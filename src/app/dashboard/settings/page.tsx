"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Moon, Sun } from "lucide-react"
import { ChangePasswordForm } from "@/components/settings/change-password-form"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export default function SettingsPage() {
  const { setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch by only rendering after mount
  useEffect(() => {

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])

  if (!mounted) {
    return null // or a skeleton loader
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold md:text-2xl text-foreground">Configurações</h1>
      </div>
      
      <Card className="border-none bg-card/50">
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>
            Personalize a aparência do portal. Alterne entre os temas claro e escuro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            defaultValue={theme} 
            onValueChange={setTheme}
            className="grid max-w-md grid-cols-2 gap-8 pt-2"
          >
            <div>
              <Label className="[&:has([data-state=checked])>div]:border-primary hover:cursor-pointer" htmlFor="light">
                <RadioGroupItem value="light" id="light" className="sr-only" />
                <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
                  <div className="space-y-2 rounded-sm bg-[#FDFDFD] p-2">
                    <div className="space-y-2 rounded-md bg-[#EBEBEB] p-2 shadow-sm">
                      <div className="h-2 w-[80px] rounded-lg bg-[#CDCDCD]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#CDCDCD]" />
                    </div>
                    <div className="flex items-center space-x-2 rounded-md bg-[#EBEBEB] p-2 shadow-sm">
                      <div className="h-4 w-4 rounded-full bg-[#CDCDCD]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#CDCDCD]" />
                    </div>
                    <div className="flex items-center space-x-2 rounded-md bg-[#EBEBEB] p-2 shadow-sm">
                      <div className="h-4 w-4 rounded-full bg-[#CDCDCD]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#CDCDCD]" />
                    </div>
                  </div>
                </div>
                <span className="block w-full p-2 text-center font-normal">
                    <Sun className="mr-2 inline-block h-4 w-4" />
                    Claro
                </span>
              </Label>
            </div>
            <div>
              <Label className="[&:has([data-state=checked])>div]:border-primary hover:cursor-pointer" htmlFor="dark">
                <RadioGroupItem value="dark" id="dark" className="sr-only" />
                <div className="items-center rounded-md border-2 border-muted p-1 hover:border-accent">
                  <div className="space-y-2 rounded-sm bg-[#1F1F1F] p-2">
                    <div className="space-y-2 rounded-md bg-[#322E2B] p-2 shadow-sm">
                      <div className="h-2 w-[80px] rounded-lg bg-[#828384]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#828384]" />
                    </div>
                    <div className="flex items-center space-x-2 rounded-md bg-[#322E2B] p-2 shadow-sm">
                      <div className="h-4 w-4 rounded-full bg-[#828384]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#828384]" />
                    </div>
                    <div className="flex items-center space-x-2 rounded-md bg-[#322E2B] p-2 shadow-sm">
                      <div className="h-4 w-4 rounded-full bg-[#828384]" />
                      <div className="h-2 w-[100px] rounded-lg bg-[#828384]" />
                    </div>
                  </div>
                </div>
                <span className="block w-full p-2 text-center font-normal">
                    <Moon className="mr-2 inline-block h-4 w-4" />
                    Escuro
                </span>
              </Label>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      <ChangePasswordForm />
    </div>
  )
}
