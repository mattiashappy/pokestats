import * as React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BadgeCheck, ChevronRight, CreditCard, Gavel, Globe, Layers, Settings, Shield, Sparkles, Star } from 'lucide-react'

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

  // Keep Auctions group open when you're anywhere under /auctions
  const defaultOpen = pathname.startsWith('/auctions')

  // Keep your original logic
  const showBilling = user?.role !== 'admin'

  return (
    <Sidebar collapsible="icon">
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>

          <SidebarMenu>
            {/* Auctions collapsible group */}
            <SidebarMenuItem>
              <Collapsible defaultOpen={defaultOpen} className="group/collapsible">
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton
                    tooltip="Auctions"
                    isActive={pathname.startsWith('/auctions')}
                    asChild
                  >
                    <Link to="/auctions">
                      <Gavel className="h-4 w-4" />
                      <span>Auctions</span>
                      <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                    </Link>
                  </SidebarMenuButton>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <SidebarMenuSub>
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

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, '/pokemon')}>
                <Link to="/pokemon">
                  <Sparkles className="h-4 w-4" />
                  <span>Pokémon</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive(pathname, '/expansions')}>
                <Link to="/expansions">
                  <Layers className="h-4 w-4" />
                  <span>Expansions</span>
                </Link>
              </SidebarMenuButton>
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