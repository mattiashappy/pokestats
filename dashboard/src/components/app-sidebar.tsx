import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BadgeCheck, BarChart3, ChevronRight, CreditCard, Globe, Settings, Shield, Star } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail
} from './ui/sidebar'
import { useAuth } from '../providers/auth'

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function AppSidebar(): JSX.Element {
  const { pathname } = useLocation()
  const { user } = useAuth()

  // Keep Pokémon group open when you're anywhere under /auctions
  const defaultOpen = pathname.startsWith('/auctions')

  // Keep your original logic
  const showBilling = user?.role !== 'admin'

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>

          <SidebarMenu>
            {/* Pokémon collapsible group */}
            <SidebarMenuItem>
              <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
                <CollapsibleTrigger asChild>
                  {/* Button toggles collapse (no navigation here) */}
                  <SidebarMenuButton tooltip="Pokémon" isActive={pathname.startsWith('/auctions')}>
                    <BarChart3 className="h-4 w-4" />
                    <span>Pokémon</span>
                    <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {/* Auctions (main list) */}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, '/auctions')}>
                        <Link to="/auctions">Auctions</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>

                    {/* Attributes */}
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, '/auctions/era')}>
                        <Link to="/auctions/era">
                          <Star className="mr-2 h-4 w-4" />
                          Eras
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>

                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, '/auctions/language')}>
                        <Link to="/auctions/language">
                          <Globe className="mr-2 h-4 w-4" />
                          Languages
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>

                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, '/auctions/grading')}>
                        <Link to="/auctions/grading">
                          <BadgeCheck className="mr-2 h-4 w-4" />
                          Grading companies
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>

                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton asChild isActive={isActive(pathname, '/auctions/grade')}>
                        <Link to="/auctions/grade">Grades</Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>

            {/* Settings */}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, '/settings')}>
                <Link to="/settings">
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Admin */}
            {user?.role === 'admin' ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive(pathname, '/admin')}>
                  <Link to="/admin">
                    <Shield className="h-4 w-4" />
                    <span>Admin</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}

            {/* Billing */}
            {showBilling ? (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive(pathname, '/billing')}>
                  <Link to="/billing">
                    <CreditCard className="h-4 w-4" />
                    <span>Billing</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  )
}